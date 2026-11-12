import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { TABS, type TabName } from "@/lib/store/schema";
import { getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";

// 전체 데이터 내려받기(JSON, CSV). '모든 권한' 관리자만 할 수 있다.
// 본인 외에는 볼 수 없게 정한 내용은 내보내지 않는다:
//  - 인터뷰 원문(Interviews)은 통째로 제외
//  - 타임캡슐 본문(Capsules.body)은 암호화된 값이라 비우고 작성 현황만 남김
//  - 아직 뽑히지 않은 고민 본문, 승인 전 소개 초안, 승인 전 2진실 1거짓은 비움
//  - 초대코드는 제외
const SKIP: TabName[] = ["Interviews"];

function redact(tab: TabName, r: Row): Row {
  const x = { ...r };
  if (tab === "Capsules") x.body = "";
  if (tab === "Worries" && !x.drawnAt) x.body = "";
  if (tab === "Profiles") {
    x.draftMd = "";
    if (x.introStatus !== "approved") x.introMd = "";
  }
  if (tab === "TruthLies" && x.status !== "approved") {
    x.statements = "";
    x.lieIndex = "";
  }
  return x;
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function GET(req: Request) {
  const g = await guard("all");
  if ("err" in g) return g.err;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const tab = url.searchParams.get("tab") as TabName | null;
  const s = await getStore();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    if (!tab || !(tab in TABS) || SKIP.includes(tab)) return bad("내려받을 데이터를 골라 주세요.");
    let rows = (await s.list(tab)).map((r) => redact(tab, r));
    if (tab === "Settings") rows = rows.filter((r) => r.id !== "inviteCode");
    const cols = TABS[tab] as readonly string[];
    // 엑셀에서 한글이 깨지지 않도록 앞에 BOM 을 붙인다.
    const text = "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c] ?? "")).join(","))].join("\r\n");
    return new NextResponse(text, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${tab}-${stamp}.csv"` },
    });
  }

  const out: Record<string, Row[]> = {};
  for (const t of Object.keys(TABS) as TabName[]) {
    if (SKIP.includes(t)) continue;
    let rows = (await s.list(t)).map((r) => redact(t, r));
    if (t === "Settings") rows = rows.filter((r) => r.id !== "inviteCode");
    out[t] = rows;
  }
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), note: "인터뷰 원문, 타임캡슐 본문, 공개 전 내용은 포함하지 않아요.", tabs: out }, null, 2);
  return new NextResponse(json, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="wonwoohoe-backup-${stamp}.json"` },
  });
}
