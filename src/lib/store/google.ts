import { google, type sheets_v4 } from "googleapis";
import { randomUUID } from "node:crypto";
import { TABS, type TabName } from "./schema";
import type { Row, Store } from "./types";

// 구글 시트 저장소. 서버에서만 사용한다.
// 구글 시트 요청 한도(분당 60회/사용자)를 넘지 않도록 탭 단위로 짧게 캐시한다.
const TTL_MS = 1500;

type CacheEntry = { at: number; rows: Row[] };

export class GoogleStore implements Store {
  private sheets: sheets_v4.Sheets;
  private cache = new Map<TabName, CacheEntry>();
  private inflight = new Map<TabName, Promise<Row[]>>();
  private ready: Promise<void> | null = null;
  private sheetIds = new Map<string, number>();

  constructor(private spreadsheetId: string, credentialsJson: string) {
    const credentials = JSON.parse(credentialsJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    this.sheets = google.sheets({ version: "v4", auth });
  }

  // 처음 한 번, 없는 탭과 머리글 행을 만든다.
  private init(): Promise<void> {
    if (!this.ready) {
      this.ready = (async () => {
        const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        const existing = new Map<string, number>();
        for (const s of meta.data.sheets ?? []) {
          if (s.properties?.title && s.properties.sheetId != null) {
            existing.set(s.properties.title, s.properties.sheetId);
          }
        }
        const missing = (Object.keys(TABS) as TabName[]).filter((t) => !existing.has(t));
        if (missing.length) {
          const res = await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) },
          });
          for (const r of res.data.replies ?? []) {
            const p = r.addSheet?.properties;
            if (p?.title && p.sheetId != null) existing.set(p.title, p.sheetId);
          }
          await this.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            requestBody: {
              valueInputOption: "RAW",
              data: missing.map((t) => ({ range: `${t}!A1`, values: [[...TABS[t]]] })),
            },
          });
        }
        this.sheetIds = existing;
      })();
    }
    return this.ready;
  }

  async list(tab: TabName): Promise<Row[]> {
    const hit = this.cache.get(tab);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;
    const pending = this.inflight.get(tab);
    if (pending) return pending;
    const p = this.fetchTab(tab).finally(() => this.inflight.delete(tab));
    this.inflight.set(tab, p);
    return p;
  }

  private async fetchTab(tab: TabName): Promise<Row[]> {
    await this.init();
    const cols = TABS[tab];
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A2:${colLetter(cols.length)}`,
    });
    const rows = (res.data.values ?? []).map((v) => {
      const r: Row = {};
      cols.forEach((c, i) => (r[c] = String(v[i] ?? "")));
      return r;
    });
    this.cache.set(tab, { at: Date.now(), rows });
    return rows;
  }

  async insert(tab: TabName, row: Partial<Row>): Promise<Row> {
    await this.init();
    const full: Row = {};
    for (const c of TABS[tab]) full[c] = row[c] ?? "";
    full.id = full.id || randomUUID();
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [TABS[tab].map((c) => full[c])] },
    });
    this.cache.delete(tab);
    return full;
  }

  async update(tab: TabName, id: string, patch: Partial<Row>): Promise<Row | null> {
    await this.init();
    this.cache.delete(tab); // 항상 최신 행 번호로 수정
    const rows = await this.list(tab);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const next: Row = { ...rows[i], ...patch, id };
    const rowNo = i + 2;
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${tab}!A${rowNo}:${colLetter(TABS[tab].length)}${rowNo}`,
      valueInputOption: "RAW",
      requestBody: { values: [TABS[tab].map((c) => next[c] ?? "")] },
    });
    this.cache.delete(tab);
    return next;
  }

  async remove(tab: TabName, id: string): Promise<boolean> {
    await this.init();
    this.cache.delete(tab);
    const rows = await this.list(tab);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return false;
    const sheetId = this.sheetIds.get(tab);
    if (sheetId == null) return false;
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: i + 1, endIndex: i + 2 } } },
        ],
      },
    });
    this.cache.delete(tab);
    return true;
  }
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
