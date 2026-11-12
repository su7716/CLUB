"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Room = { id: string; date: string; name: string; capacity: number; memo: string; guests: string[] };
type Data = {
  published: boolean; nights: string[]; dates: string[]; members: { id: string; name: string }[]; attendingIds: string[];
  rooms: Room[]; free: Record<string, string[]>;
};

export const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 숙박 방배정: 날짜별로 방을 만들고 투숙자를 배정한다. 확인을 눌러야 회원에게 배포된다.
export function RoomsPanel({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/rooms`;
  const [d, setD] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, Room>>({});
  const [day, setDay] = useState("");
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [nu, setNu] = useState({ name: "", capacity: 2, memo: "" });
  const [copyTo, setCopyTo] = useState("");

  const load = useCallback(async () => {
    const r = await api<Data>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setD(r.data);
    setDraft(Object.fromEntries(r.data.rooms.map((c) => [c.id, { ...c }])));
    setDay((x) => (x && r.data.dates.includes(x) ? x : r.data.dates[0] ?? ""));
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  const nm = (id: string) => d?.members.find((m) => m.id === id)?.name ?? "";
  const set = (id: string, patch: Partial<Room>) => setDraft((x) => ({ ...x, [id]: { ...x[id], ...patch } }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(base, { body: { date: day, ...nu } });
    setNote(r.ok ? { tone: "info", text: "방을 만들었어요." } : { tone: "bad", text: r.error });
    if (r.ok) setNu({ name: "", capacity: nu.capacity, memo: "" });
    load();
  }
  async function save(id: string) {
    const c = draft[id];
    const r = await api(`${base}/${id}`, { method: "PATCH", body: { name: c.name, capacity: c.capacity, memo: c.memo, guests: c.guests } });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function remove(id: string) {
    if (!window.confirm("이 방을 지울까요?")) return;
    const r = await api(`${base}/${id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function act(action: "publish" | "unpublish" | "copy") {
    const r = await api<{ copied?: number }>(`${base}/publish`, { body: { action, from: day, to: copyTo } });
    if (!r.ok) setNote({ tone: "bad", text: r.error });
    else setNote({ tone: "info", text: action === "copy" ? `${r.data.copied ?? 0}개 방을 ${dayLabel(copyTo)}로 복사했어요. 확인해서 배포해 주세요.` : action === "publish" ? "방배정을 회원에게 배포했어요." : "배포를 취소했어요." });
    load();
  }

  if (!d) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const shown = d.rooms.filter((r) => r.date === day);
  const free = d.free[day] ?? [];
  const otherDates = d.nights.filter((x) => x !== day && !d.rooms.some((r) => r.date === x));

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className={`pill ${d.published ? "ok" : "warn"}`}>{d.published ? "회원에게 배포됨" : "배포 전 (회원에게 안 보여요)"}</span>
        {day && <span className="small">{dayLabel(day)} 방이 없는 참석자 {free.length}명{free.length > 0 ? `: ${free.map(nm).join(", ")}` : ""}</span>}
      </div>

      <div className="subnav" role="tablist" aria-label="숙박 날짜">
        {d.dates.map((x) => <a key={x} href="#" role="tab" aria-selected={day === x} className={day === x ? "on" : ""} onClick={(e) => { e.preventDefault(); setDay(x); }}>{dayLabel(x)}</a>)}
      </div>
      {d.dates.length === 0 && <div className="msg info">행사 개요에 시작·종료 일시를 먼저 입력하면 숙박 날짜가 나와요.</div>}

      {day && shown.length === 0 && <div className="msg info">{dayLabel(day)}에 만든 방이 없어요. 아래에서 방을 만들어 주세요.</div>}
      <div className="cards">
        {shown.map((c) => {
          const x = draft[c.id] ?? c;
          const options = d.members.filter((m) => !x.guests.includes(m.id));
          return (
            <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <input aria-label="방 이름" className="field" style={{ width: 150, minHeight: 42 }} value={x.name} placeholder="방 이름" disabled={!canEdit} onChange={(e) => set(c.id, { name: e.target.value })} />
                <span className="pill blue">{x.guests.length} / {x.capacity}명</span>
              </div>
              <div className="grid2">
                <div><label className="l" htmlFor={`cp-${c.id}`}>정원</label><input id={`cp-${c.id}`} className="field" type="number" min={1} max={20} value={x.capacity} disabled={!canEdit} onChange={(e) => set(c.id, { capacity: Number(e.target.value) })} /></div>
                <div><label className="l" htmlFor={`mm-${c.id}`}>메모 (층·침대 형태 등)</label><input id={`mm-${c.id}`} className="field" value={x.memo} disabled={!canEdit} onChange={(e) => set(c.id, { memo: e.target.value })} /></div>
              </div>
              <div className="checks" aria-label="투숙자">
                {x.guests.map((r) => (
                  <label key={r}>{nm(r)}{canEdit && <button type="button" className="mini danger" style={{ minHeight: 28, padding: "0 8px" }} onClick={() => set(c.id, { guests: x.guests.filter((y) => y !== r) })} aria-label={`${nm(r)} 빼기`}>×</button>}</label>
                ))}
                {x.guests.length === 0 && <span className="small">투숙자가 없어요</span>}
              </div>
              {canEdit && (
                <select aria-label="투숙자 추가" className="field" value="" onChange={(e) => e.target.value && set(c.id, { guests: [...x.guests, e.target.value] })}>
                  <option value="">+ 투숙자 추가 (이 날 방 없는 참석자 우선)</option>
                  {[...options].sort((a, b) => Number(free.includes(b.id)) - Number(free.includes(a.id))).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{free.includes(m.id) ? " (방 없음)" : ""}</option>
                  ))}
                </select>
              )}
              {canEdit && <div className="row"><button className="mini" type="button" onClick={() => save(c.id)}>저장</button><button className="mini danger" type="button" onClick={() => remove(c.id)}>방 지우기</button></div>}
            </div>
          );
        })}
      </div>

      {canEdit && day && (
        <>
          <form className="card" onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: "400 18px var(--display)" }}>+ {dayLabel(day)} 방 만들기</b>
            <div className="grid2">
              <div><label className="l" htmlFor="nr-nm">방 이름 (비우면 자동)</label><input id="nr-nm" className="field" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} placeholder="예: 301호" /></div>
              <div><label className="l" htmlFor="nr-cp">정원</label><input id="nr-cp" className="field" type="number" min={1} max={20} value={nu.capacity} onChange={(e) => setNu({ ...nu, capacity: Number(e.target.value) })} /></div>
              <div><label className="l" htmlFor="nr-mm">메모</label><input id="nr-mm" className="field" value={nu.memo} onChange={(e) => setNu({ ...nu, memo: e.target.value })} /></div>
            </div>
            <button className="btn" type="submit" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }}>방 만들기</button>
          </form>
          {shown.length > 0 && otherDates.length > 0 && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <select aria-label="복사할 날짜" className="field" style={{ width: 130, minHeight: 48 }} value={copyTo} onChange={(e) => setCopyTo(e.target.value)}>
                <option value="">복사할 날짜</option>
                {otherDates.map((x) => <option key={x} value={x}>{dayLabel(x)}</option>)}
              </select>
              <button className="btn white" type="button" disabled={!copyTo} style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("copy")}>{dayLabel(day)} 배정 그대로 복사</button>
            </div>
          )}
          <div className="row" style={{ flexWrap: "wrap" }}>
            {!d.published
              ? <button className="btn" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("publish")} disabled={d.rooms.length === 0}>확인 (회원에게 배포)</button>
              : <button className="btn red" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("unpublish")}>배포 취소</button>}
          </div>
          <span className="small">같은 날짜에 한 사람은 한 방에만 들어갈 수 있어요. 날짜마다 방 구성이 달라도 돼요. 방이나 투숙자를 바꾸면 다시 확인을 눌러야 배포돼요.</span>
        </>
      )}
    </>
  );
}
