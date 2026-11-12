"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Car = { id: string; name: string; plate: string; leg: string; driverId: string; seats: number; from: string; to: string; departAt: string; arriveAt: string; riders: string[] };
type Data = {
  published: boolean; legs: string[]; members: { id: string; name: string }[]; attendingIds: string[];
  cars: Car[]; free: { go: string[]; back: string[] };
};

const LEG_FREE = (leg: string, f: Data["free"]) => (leg === "왕복" ? f.go.filter((x) => f.back.includes(x)) : leg === "갈 때" ? f.go : f.back);

// 카풀 배정: 왕복 / 갈 때 / 올 때 구간별로 차량을 등록하고 동승자를 배정한다. 확인을 눌러야 회원에게 배포된다.
export function CarpoolPanel({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/carpool`;
  const [d, setD] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Record<string, Car>>({});
  const [leg, setLeg] = useState("전체");
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [nu, setNu] = useState({ name: "", plate: "", leg: "왕복", driverId: "", seats: 4, from: "", to: "", departAt: "", arriveAt: "" });

  const load = useCallback(async () => {
    const r = await api<Data>(base);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setD(r.data);
    setDraft(Object.fromEntries(r.data.cars.map((c) => [c.id, { ...c }])));
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  const nm = (id: string) => d?.members.find((m) => m.id === id)?.name ?? "";
  const set = (id: string, patch: Partial<Car>) => setDraft((x) => ({ ...x, [id]: { ...x[id], ...patch } }));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(base, { body: nu });
    setNote(r.ok ? { tone: "info", text: "차량을 등록했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function save(id: string) {
    const c = draft[id];
    const r = await api(`${base}/${id}`, { method: "PATCH", body: { name: c.name, plate: c.plate, leg: c.leg, driverId: c.driverId, seats: c.seats, from: c.from, to: c.to, departAt: c.departAt, arriveAt: c.arriveAt, riders: c.riders } });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function remove(id: string) {
    if (!window.confirm("이 차량을 지울까요?")) return;
    const r = await api(`${base}/${id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function act(action: "publish" | "unpublish" | "auto") {
    const r = await api<{ added?: number }>(`${base}/publish`, { body: { action } });
    if (!r.ok) setNote({ tone: "bad", text: r.error });
    else setNote({ tone: "info", text: action === "auto" ? `빈 좌석에 ${r.data.added ?? 0}명을 배정했어요. 확인해서 배포해 주세요.` : action === "publish" ? "카풀을 회원에게 배포했어요." : "배포를 취소했어요." });
    load();
  }

  if (!d) return note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const shown = d.cars.filter((c) => leg === "전체" || c.leg === leg);

  return (
    <>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className={`pill ${d.published ? "ok" : "warn"}`}>{d.published ? "회원에게 배포됨" : "배포 전 (회원에게 안 보여요)"}</span>
        <span className="small">갈 때 차 없는 참석자 {d.free.go.length}명 · 올 때 차 없는 참석자 {d.free.back.length}명</span>
      </div>
      <div className="subnav" role="tablist" aria-label="구간">
        {["전체", ...d.legs].map((l) => <a key={l} href="#" role="tab" aria-selected={leg === l} className={leg === l ? "on" : ""} onClick={(e) => { e.preventDefault(); setLeg(l); }}>{l}</a>)}
      </div>

      {shown.length === 0 && <div className="msg info">등록된 차량이 없어요. 아래에서 차량을 등록해 주세요.</div>}
      <div className="cards">
        {shown.map((c) => {
          const x = draft[c.id] ?? c;
          const options = d.members.filter((m) => !x.riders.includes(m.id) && m.id !== x.driverId);
          return (
            <div key={c.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <input aria-label="그룹명" className="field" style={{ width: 150, minHeight: 42 }} value={x.name} placeholder="그룹명" disabled={!canEdit} onChange={(e) => set(c.id, { name: e.target.value })} />
                <select aria-label="구간" className="field" style={{ width: 110, minHeight: 42 }} value={x.leg} disabled={!canEdit} onChange={(e) => set(c.id, { leg: e.target.value })}>
                  {d.legs.map((l) => <option key={l}>{l}</option>)}
                </select>
                <span className="pill blue">{x.riders.length} / {x.seats}석</span>
              </div>
              <div className="grid2">
                <div><label className="l" htmlFor={`dr-${c.id}`}>운전자</label>
                  <select id={`dr-${c.id}`} className="field" value={x.driverId} disabled={!canEdit} onChange={(e) => set(c.id, { driverId: e.target.value })}>
                    <option value="">미정</option>{d.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select></div>
                <div><label className="l" htmlFor={`pl-${c.id}`}>차량번호</label><input id={`pl-${c.id}`} className="field" value={x.plate} disabled={!canEdit} onChange={(e) => set(c.id, { plate: e.target.value })} /></div>
                <div><label className="l" htmlFor={`se-${c.id}`}>좌석 수(동승 가능)</label><input id={`se-${c.id}`} className="field" type="number" min={1} max={12} value={x.seats} disabled={!canEdit} onChange={(e) => set(c.id, { seats: Number(e.target.value) })} /></div>
                <div><label className="l" htmlFor={`fr-${c.id}`}>출발 장소</label><input id={`fr-${c.id}`} className="field" value={x.from} disabled={!canEdit} onChange={(e) => set(c.id, { from: e.target.value })} /></div>
                <div><label className="l" htmlFor={`dp-${c.id}`}>출발 예상 시간</label><input id={`dp-${c.id}`} className="field" type="datetime-local" value={x.departAt} disabled={!canEdit} onChange={(e) => set(c.id, { departAt: e.target.value })} /></div>
                <div><label className="l" htmlFor={`to-${c.id}`}>도착 장소</label><input id={`to-${c.id}`} className="field" value={x.to} disabled={!canEdit} onChange={(e) => set(c.id, { to: e.target.value })} /></div>
                <div><label className="l" htmlFor={`ar-${c.id}`}>도착 예상 시간</label><input id={`ar-${c.id}`} className="field" type="datetime-local" value={x.arriveAt} disabled={!canEdit} onChange={(e) => set(c.id, { arriveAt: e.target.value })} /></div>
              </div>
              <div className="checks" aria-label="동승자">
                {x.riders.map((r) => (
                  <label key={r}>{nm(r)}{canEdit && <button type="button" className="mini danger" style={{ minHeight: 28, padding: "0 8px" }} onClick={() => set(c.id, { riders: x.riders.filter((y) => y !== r) })} aria-label={`${nm(r)} 빼기`}>×</button>}</label>
                ))}
                {x.riders.length === 0 && <span className="small">동승자가 없어요</span>}
              </div>
              {canEdit && (
                <select aria-label="동승자 추가" className="field" value="" onChange={(e) => e.target.value && set(c.id, { riders: [...x.riders, e.target.value] })}>
                  <option value="">+ 동승자 추가 (차 없는 참석자 우선)</option>
                  {[...options].sort((a, b) => Number(LEG_FREE(x.leg, d.free).includes(b.id)) - Number(LEG_FREE(x.leg, d.free).includes(a.id))).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}{LEG_FREE(x.leg, d.free).includes(m.id) ? " (차 없음)" : ""}</option>
                  ))}
                </select>
              )}
              {canEdit && <div className="row"><button className="mini" type="button" onClick={() => save(c.id)}>저장</button><button className="mini danger" type="button" onClick={() => remove(c.id)}>차량 지우기</button></div>}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <>
          <form className="card" onSubmit={create} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <b style={{ font: "400 18px var(--display)" }}>+ 차량 등록</b>
            <div className="grid2">
              <div><label className="l" htmlFor="nc-leg">구간</label><select id="nc-leg" className="field" value={nu.leg} onChange={(e) => setNu({ ...nu, leg: e.target.value })}>{d.legs.map((l) => <option key={l}>{l}</option>)}</select></div>
              <div><label className="l" htmlFor="nc-dr">운전자</label><select id="nc-dr" className="field" value={nu.driverId} onChange={(e) => setNu({ ...nu, driverId: e.target.value })}><option value="">미정</option>{d.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div><label className="l" htmlFor="nc-pl">차량번호</label><input id="nc-pl" className="field" value={nu.plate} onChange={(e) => setNu({ ...nu, plate: e.target.value })} /></div>
              <div><label className="l" htmlFor="nc-nm">그룹명 (비우면 자동)</label><input id="nc-nm" className="field" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} /></div>
              <div><label className="l" htmlFor="nc-se">좌석 수(동승 가능)</label><input id="nc-se" className="field" type="number" min={1} max={12} value={nu.seats} onChange={(e) => setNu({ ...nu, seats: Number(e.target.value) })} /></div>
              <div><label className="l" htmlFor="nc-fr">출발 장소</label><input id="nc-fr" className="field" value={nu.from} onChange={(e) => setNu({ ...nu, from: e.target.value })} /></div>
              <div><label className="l" htmlFor="nc-dp">출발 예상 시간</label><input id="nc-dp" className="field" type="datetime-local" value={nu.departAt} onChange={(e) => setNu({ ...nu, departAt: e.target.value })} /></div>
              <div><label className="l" htmlFor="nc-to">도착 장소</label><input id="nc-to" className="field" value={nu.to} onChange={(e) => setNu({ ...nu, to: e.target.value })} /></div>
              <div><label className="l" htmlFor="nc-ar">도착 예상 시간</label><input id="nc-ar" className="field" type="datetime-local" value={nu.arriveAt} onChange={(e) => setNu({ ...nu, arriveAt: e.target.value })} /></div>
            </div>
            <button className="btn" type="submit" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }}>차량 등록</button>
          </form>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("auto")}>빈 좌석 자동 배정</button>
            {!d.published
              ? <button className="btn" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("publish")} disabled={d.cars.length === 0}>확인 (회원에게 배포)</button>
              : <button className="btn red" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={() => act("unpublish")}>배포 취소</button>}
          </div>
          <span className="small">같은 사람이 같은 구간의 두 차량에 들어갈 수 없어요. 왕복 차량은 갈 때와 올 때를 모두 포함해요. 운전자, 차량번호, 장소, 시간은 몰라도 등록할 수 있어요. 그룹명을 비우면 "카풀 1조"처럼 자동으로 붙고 나중에 바꿀 수 있어요. 차량이나 동승자를 바꾸면 다시 확인을 눌러야 배포돼요.</span>
        </>
      )}
    </>
  );
}
