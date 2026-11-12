"use client";

import { useCallback, useEffect, useState } from "react";
import { api, won } from "@/lib/client";

type Kind = "schedule" | "prep" | "costs";
type Item = Record<string, string | number | boolean> & { id: string };
type Note = { tone: "bad" | "info"; text: string } | null;

const BLANK: Record<Kind, Record<string, string | number | boolean>> = {
  schedule: { at: "", title: "" },
  prep: { item: "", owner: "", done: false },
  costs: { item: "", budget: 0, spent: 0, status: "예정", owner: "" },
};
const STATUS = ["예정", "집행 완료", "보류"];
const TITLE: Record<Kind, string> = { schedule: "일정", prep: "준비 목록", costs: "비용" };

// 행사 일정 / 준비 목록 / 비용(예산과 집행). 같은 화면 틀로 세 가지를 다룬다.
// 일정은 회원에게 보이고, 준비 목록과 비용은 관리자만 본다.
export function EventItems({ eventId, kind, canEdit }: { eventId: string; kind: Kind; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/items/${kind}`;
  const [items, setItems] = useState<Item[] | null>(null);
  const [draft, setDraft] = useState<Record<string, Item>>({});
  const [add, setAdd] = useState<Record<string, string | number | boolean>>({ ...BLANK[kind] });
  const [note, setNote] = useState<Note>(null);
  const [attend, setAttend] = useState(0);
  const [fee, setFee] = useState("");

  const load = useCallback(async () => {
    const r = await api<{ items: Item[] }>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setItems(r.data.items);
    setDraft(Object.fromEntries(r.data.items.map((i) => [i.id, { ...i }])));
    if (kind === "costs") {
      const e = await api<{ event: { fee: string }; rows: { answer: string }[] }>(`/api/admin/events/${eventId}`);
      if (e.ok) {
        setAttend(e.data.rows.filter((x) => x.answer === "참석").length);
        setFee(e.data.event.fee);
      }
    }
  }, [base, kind, eventId]);
  useEffect(() => {
    load();
  }, [load]);

  const set = (id: string, k: string, v: string | number | boolean) => setDraft((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));
  const body = (x: Record<string, unknown>) => {
    const { id: _id, ...rest } = x;
    void _id;
    return rest;
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(base, { body: add });
    setNote(r.ok ? { tone: "info", text: "추가했어요." } : { tone: "bad", text: r.error });
    if (r.ok) setAdd({ ...BLANK[kind] });
    load();
  }
  async function save(id: string) {
    const r = await api(`${base}/${id}`, { method: "PATCH", body: body(draft[id]) });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function toggle(id: string, done: boolean) {
    const r = await api(`${base}/${id}`, { method: "PATCH", body: { ...body(draft[id]), done } });
    if (!r.ok) setNote({ tone: "bad", text: r.error });
    load();
  }
  async function remove(id: string) {
    if (!window.confirm("지울까요?")) return;
    const r = await api(`${base}/${id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  async function applyFee(v: number) {
    const r = await api(`/api/admin/events/${eventId}`, { method: "PATCH", body: { fee: String(v) } });
    setNote(r.ok ? { tone: "info", text: `1인 회비를 ${won(v)}으로 정했어요. 회원 화면에 안내돼요.` } : { tone: "bad", text: r.error });
    load();
  }

  if (!items) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const totalBudget = kind === "costs" ? items.reduce((n, i) => n + Number(i.budget), 0) : 0;
  const totalSpent = kind === "costs" ? items.reduce((n, i) => n + Number(i.spent), 0) : 0;
  // 1인 회비 제안: 예산 합계를 참석 인원으로 나누고 천 원 단위로 올린다.
  const suggest = attend > 0 ? Math.ceil(totalBudget / attend / 1000) * 1000 : 0;

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {kind === "schedule" && <span className="small">여기에 적은 일정은 회원의 행사 화면에도 보여요.</span>}
      {kind === "prep" && <span className="small">준비 목록은 관리자만 볼 수 있어요. 끝낸 것은 체크해 주세요.</span>}
      {kind === "costs" && <span className="small">비용은 “회비·비용” 권한이 있는 관리자만 볼 수 있어요.</span>}

      {kind === "costs" && (
        <div className="cards">
          <div className="card"><span className="small">예산 합계</span><div className="big">{won(totalBudget)}</div></div>
          <div className="card"><span className="small">집행 합계</span><div className="big">{won(totalSpent)}</div></div>
          <div className="card"><span className="small">잔액</span><div className="big" style={{ color: totalBudget - totalSpent < 0 ? "var(--red-t)" : "var(--green-t)" }}>{won(totalBudget - totalSpent)}</div></div>
          <div className="card">
            <span className="small">1인 회비 제안 (예산 ÷ 참석 {attend}명)</span>
            <div className="big">{suggest ? won(suggest) : "-"}</div>
            <span className="small">현재 회비 {fee ? won(fee) : "미정"}</span>
            {canEdit && suggest > 0 && <button className="mini" type="button" style={{ marginTop: 6 }} onClick={() => applyFee(suggest)}>이 금액으로 정하기</button>}
          </div>
        </div>
      )}

      {items.length === 0 && <div className="msg info">아직 {TITLE[kind]} 항목이 없어요. 아래에서 추가해 주세요.</div>}
      <div className="tblw">
        <table className="tbl" style={{ minWidth: kind === "costs" ? 760 : 560 }}>
          <thead>
            <tr>
              {kind === "schedule" && <><th>일시</th><th>내용</th></>}
              {kind === "prep" && <><th>완료</th><th>준비물</th><th>담당</th></>}
              {kind === "costs" && <><th>항목</th><th>예산(원)</th><th>집행(원)</th><th>상태</th><th>담당</th></>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const d = draft[i.id] ?? i;
              return (
                <tr key={i.id}>
                  {kind === "schedule" && (
                    <>
                      <td><input aria-label="일시" className="field" type="datetime-local" style={{ minHeight: 42 }} value={String(d.at)} disabled={!canEdit} onChange={(e) => set(i.id, "at", e.target.value)} /></td>
                      <td><input aria-label="내용" className="field" style={{ minHeight: 42 }} value={String(d.title)} disabled={!canEdit} onChange={(e) => set(i.id, "title", e.target.value)} /></td>
                    </>
                  )}
                  {kind === "prep" && (
                    <>
                      <td><input aria-label="완료" type="checkbox" style={{ width: 24, height: 24 }} checked={Boolean(i.done)} disabled={!canEdit} onChange={(e) => toggle(i.id, e.target.checked)} /></td>
                      <td><input aria-label="준비물" className="field" style={{ minHeight: 42, textDecoration: i.done ? "line-through" : undefined }} value={String(d.item)} disabled={!canEdit} onChange={(e) => set(i.id, "item", e.target.value)} /></td>
                      <td><input aria-label="담당" className="field" style={{ minHeight: 42 }} value={String(d.owner)} disabled={!canEdit} onChange={(e) => set(i.id, "owner", e.target.value)} /></td>
                    </>
                  )}
                  {kind === "costs" && (
                    <>
                      <td><input aria-label="항목" className="field" style={{ minHeight: 42 }} value={String(d.item)} disabled={!canEdit} onChange={(e) => set(i.id, "item", e.target.value)} /></td>
                      <td><input aria-label="예산" className="field num" inputMode="numeric" style={{ minHeight: 42, width: 120 }} value={String(d.budget)} disabled={!canEdit} onChange={(e) => set(i.id, "budget", Number(e.target.value.replace(/\D/g, "")))} /></td>
                      <td><input aria-label="집행" className="field num" inputMode="numeric" style={{ minHeight: 42, width: 120 }} value={String(d.spent)} disabled={!canEdit} onChange={(e) => set(i.id, "spent", Number(e.target.value.replace(/\D/g, "")))} /></td>
                      <td>
                        <select aria-label="상태" className="field" style={{ minHeight: 42, width: 110 }} value={String(d.status)} disabled={!canEdit} onChange={(e) => set(i.id, "status", e.target.value)}>
                          {STATUS.map((s) => <option key={s}>{s}</option>)}
                        </select>
                      </td>
                      <td><input aria-label="담당" className="field" style={{ minHeight: 42, width: 110 }} value={String(d.owner)} disabled={!canEdit} onChange={(e) => set(i.id, "owner", e.target.value)} /></td>
                    </>
                  )}
                  <td style={{ whiteSpace: "nowrap" }}>
                    {canEdit && <><button className="mini" type="button" onClick={() => save(i.id)}>저장</button>{" "}<button className="mini danger" type="button" onClick={() => remove(i.id)}>삭제</button></>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <form className="card" onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: "400 18px var(--display)" }}>+ {TITLE[kind]} 추가</b>
          <div className="grid2">
            {kind === "schedule" && (
              <>
                <div><label className="l" htmlFor="n-at">일시</label><input id="n-at" className="field" type="datetime-local" value={String(add.at)} onChange={(e) => setAdd({ ...add, at: e.target.value })} /></div>
                <div><label className="l" htmlFor="n-title">내용</label><input id="n-title" className="field" value={String(add.title)} onChange={(e) => setAdd({ ...add, title: e.target.value })} /></div>
              </>
            )}
            {kind === "prep" && (
              <>
                <div><label className="l" htmlFor="n-item">준비물</label><input id="n-item" className="field" value={String(add.item)} onChange={(e) => setAdd({ ...add, item: e.target.value })} /></div>
                <div><label className="l" htmlFor="n-owner">담당</label><input id="n-owner" className="field" value={String(add.owner)} onChange={(e) => setAdd({ ...add, owner: e.target.value })} /></div>
              </>
            )}
            {kind === "costs" && (
              <>
                <div><label className="l" htmlFor="n-item">항목</label><input id="n-item" className="field" value={String(add.item)} onChange={(e) => setAdd({ ...add, item: e.target.value })} /></div>
                <div><label className="l" htmlFor="n-bud">예산(원)</label><input id="n-bud" className="field" inputMode="numeric" value={String(add.budget)} onChange={(e) => setAdd({ ...add, budget: Number(e.target.value.replace(/\D/g, "")) })} /></div>
                <div><label className="l" htmlFor="n-sp">집행(원)</label><input id="n-sp" className="field" inputMode="numeric" value={String(add.spent)} onChange={(e) => setAdd({ ...add, spent: Number(e.target.value.replace(/\D/g, "")) })} /></div>
                <div><label className="l" htmlFor="n-own">담당</label><input id="n-own" className="field" value={String(add.owner)} onChange={(e) => setAdd({ ...add, owner: e.target.value })} /></div>
              </>
            )}
          </div>
          <button className="btn" type="submit" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }}>추가</button>
        </form>
      )}
    </>
  );
}
