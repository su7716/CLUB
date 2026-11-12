"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api } from "@/lib/client";

type Note = { tone: "bad" | "info"; text: string } | null;
type Member = { id: string; name: string };
const STATUS = ["논의 전", "확정·실행완료", "새로운 안건", "보류·삭제", "후속 조치"];
const TABS = [{ k: "org", l: "조직도" }, { k: "rules", l: "회칙" }, { k: "minutes", l: "회의록" }] as const;
type Kind = (typeof TABS)[number]["k"];

// 목록을 불러오고 추가·저장·삭제하는 공통 동작
function useClub<T extends { id: string }>(kind: Kind) {
  const [items, setItems] = useState<T[] | null>(null);
  const [note, setNote] = useState<Note>(null);
  const load = useCallback(async () => {
    const r = await api<{ items: T[] }>(`/api/admin/club/${kind}`);
    if (r.ok) setItems(r.data.items);
    else setNote({ tone: "bad", text: r.error });
  }, [kind]);
  useEffect(() => {
    load();
  }, [load]);
  const strip = (x: Record<string, unknown>) => {
    const { id: _id, ...rest } = x;
    void _id;
    return rest;
  };
  async function create(body: Record<string, unknown>) {
    const r = await api(`/api/admin/club/${kind}`, { body });
    setNote(r.ok ? { tone: "info", text: "추가했어요." } : { tone: "bad", text: r.error });
    load();
    return r.ok;
  }
  async function save(x: T) {
    const r = await api(`/api/admin/club/${kind}/${x.id}`, { method: "PATCH", body: strip(x as unknown as Record<string, unknown>) });
    setNote(r.ok ? { tone: "info", text: "저장했어요." } : { tone: "bad", text: r.error });
    load();
  }
  async function remove(id: string) {
    if (!window.confirm("지울까요?")) return;
    const r = await api(`/api/admin/club/${kind}/${id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }
  return { items, setItems, note, create, save, remove };
}

const Msg = ({ n }: { n: Note }) => (n ? <div className={`msg ${n.tone}`} role={n.tone === "bad" ? "alert" : "status"}>{n.text}</div> : null);

/* ───── 조직도 ───── */
type Org = { id: string; dept: string; role: string; memberId: string; clubName: string; frequency: string; leaderId: string };
function OrgEditor({ members }: { members: Member[] }) {
  const { items, setItems, note, create, save, remove } = useClub<Org>("org");
  const [add, setAdd] = useState({ dept: "", role: "", memberId: "", clubName: "", frequency: "", leaderId: "" });
  const upd = (id: string, patch: Partial<Org>) => setItems((l) => l && l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const sel = (v: string, on: (v: string) => void, label: string) => (
    <select aria-label={label} className="field" style={{ minHeight: 42 }} value={v} onChange={(e) => on(e.target.value)}>
      <option value="">(미정)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
  return (
    <>
      <Msg n={note} />
      <span className="small">구성과 내용을 모두 고칠 수 있어요. 구분에는 회장, 부회장, 고문, 사무총장, 사무국, 소모임 같은 이름을 적고, 소모임은 소모임 이름과 리더를 함께 입력해 주세요.</span>
      {!items && <p className="small">불러오는 중이에요…</p>}
      <div className="tblw">
        <table className="tbl" style={{ minWidth: 820 }}>
          <thead><tr><th>구분</th><th>직책</th><th>회원</th><th>소모임 이름</th><th>모임 횟수</th><th>리더</th><th></th></tr></thead>
          <tbody>
            {items?.map((o) => (
              <tr key={o.id}>
                <td><input aria-label="구분" className="field" style={{ minHeight: 42 }} value={o.dept} onChange={(e) => upd(o.id, { dept: e.target.value })} /></td>
                <td><input aria-label="직책" className="field" style={{ minHeight: 42 }} value={o.role} onChange={(e) => upd(o.id, { role: e.target.value })} /></td>
                <td>{sel(o.memberId, (v) => upd(o.id, { memberId: v }), "회원")}</td>
                <td><input aria-label="소모임 이름" className="field" style={{ minHeight: 42 }} value={o.clubName} onChange={(e) => upd(o.id, { clubName: e.target.value })} /></td>
                <td><input aria-label="모임 횟수" className="field" style={{ minHeight: 42 }} value={o.frequency} onChange={(e) => upd(o.id, { frequency: e.target.value })} /></td>
                <td>{sel(o.leaderId, (v) => upd(o.id, { leaderId: v }), "리더")}</td>
                <td style={{ whiteSpace: "nowrap" }}><button className="mini" type="button" onClick={() => save(o)}>저장</button>{" "}<button className="mini danger" type="button" onClick={() => remove(o.id)}>삭제</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await create(add)) setAdd({ dept: "", role: "", memberId: "", clubName: "", frequency: "", leaderId: "" }); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 18px var(--display)" }}>+ 항목 추가</b>
        <div className="grid2">
          <div><label className="l" htmlFor="o-dept">구분</label><input id="o-dept" className="field" value={add.dept} onChange={(e) => setAdd({ ...add, dept: e.target.value })} /></div>
          <div><label className="l" htmlFor="o-role">직책</label><input id="o-role" className="field" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} /></div>
          <div><label className="l" htmlFor="o-mem">회원</label>{<select id="o-mem" className="field" value={add.memberId} onChange={(e) => setAdd({ ...add, memberId: e.target.value })}><option value="">(미정)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}</div>
          <div><label className="l" htmlFor="o-club">소모임 이름</label><input id="o-club" className="field" value={add.clubName} onChange={(e) => setAdd({ ...add, clubName: e.target.value })} /></div>
          <div><label className="l" htmlFor="o-freq">모임 횟수</label><input id="o-freq" className="field" value={add.frequency} onChange={(e) => setAdd({ ...add, frequency: e.target.value })} /></div>
          <div><label className="l" htmlFor="o-lead">리더</label><select id="o-lead" className="field" value={add.leaderId} onChange={(e) => setAdd({ ...add, leaderId: e.target.value })}><option value="">(미정)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        </div>
        <button className="btn" type="submit" disabled={!add.dept.trim()} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }}>추가</button>
      </form>
    </>
  );
}

/* ───── 회칙 ───── */
type Rule = { id: string; chapter: string; article: string; body: string; version: string; confirmed: boolean };
function RulesEditor() {
  const { items, setItems, note, create, save, remove } = useClub<Rule>("rules");
  const [add, setAdd] = useState({ chapter: "", article: "", body: "", version: "v1", confirmed: false });
  const upd = (id: string, patch: Partial<Rule>) => setItems((l) => l && l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <>
      <Msg n={note} />
      <span className="small">조문 단위로 적고 고쳐요. “확정”으로 표시한 조문만 회원의 원우회 정보 화면에 보여요.</span>
      {!items && <p className="small">불러오는 중이에요…</p>}
      {items?.map((r) => (
        <div key={r.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="grid2">
            <div><label className="l" htmlFor={`rc-${r.id}`}>장</label><input id={`rc-${r.id}`} className="field" value={r.chapter} onChange={(e) => upd(r.id, { chapter: e.target.value })} /></div>
            <div><label className="l" htmlFor={`ra-${r.id}`}>조</label><input id={`ra-${r.id}`} className="field" value={r.article} onChange={(e) => upd(r.id, { article: e.target.value })} /></div>
          </div>
          <label className="l" htmlFor={`rb-${r.id}`}>내용</label>
          <textarea id={`rb-${r.id}`} className="field" rows={4} style={{ padding: 12 }} value={r.body} onChange={(e) => upd(r.id, { body: e.target.value })} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <input aria-label="버전" className="field" style={{ width: 90, minHeight: 42 }} value={r.version} onChange={(e) => upd(r.id, { version: e.target.value })} />
            <div className="checks"><label><input type="checkbox" checked={r.confirmed} onChange={(e) => upd(r.id, { confirmed: e.target.checked })} />확정</label></div>
            <button className="mini" type="button" onClick={() => save(r)}>저장</button>
            <button className="mini danger" type="button" onClick={() => remove(r.id)}>삭제</button>
          </div>
        </div>
      ))}
      <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await create(add)) setAdd({ chapter: "", article: "", body: "", version: "v1", confirmed: false }); }} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 18px var(--display)" }}>+ 조문 추가</b>
        <div className="grid2">
          <div><label className="l" htmlFor="rn-c">장 (예: 제1장 총칙)</label><input id="rn-c" className="field" value={add.chapter} onChange={(e) => setAdd({ ...add, chapter: e.target.value })} /></div>
          <div><label className="l" htmlFor="rn-a">조 (예: 제1조 (명칭))</label><input id="rn-a" className="field" value={add.article} onChange={(e) => setAdd({ ...add, article: e.target.value })} /></div>
        </div>
        <label className="l" htmlFor="rn-b">내용</label>
        <textarea id="rn-b" className="field" rows={4} style={{ padding: 12 }} value={add.body} onChange={(e) => setAdd({ ...add, body: e.target.value })} />
        <button className="btn" type="submit" disabled={!add.chapter.trim()} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }}>추가</button>
      </form>
    </>
  );
}

/* ───── 회의록 ───── */
type Agenda = { title: string; status: string; note: string };
type Min = { id: string; heldAt: string; place: string; attendees: string; agenda: Agenda[]; followUp: string; phase: string };
const BLANK_MIN = { heldAt: "", place: "", attendees: "", agenda: [] as Agenda[], followUp: "", phase: "예정" };

// 회의록 입력: 안건은 회의 전에 적고, 회의 중에 안건별로 상태와 회의 내용을 기록한다.
// record=false(새 회의)에서는 안건 제목만 적고, 만든 뒤에 열어서 회의 기록을 채운다.
function MinuteForm({ v, onChange, record }: { v: Omit<Min, "id">; onChange: (v: Omit<Min, "id">) => void; record: boolean }) {
  const setA = (i: number, patch: Partial<Agenda>) => onChange({ ...v, agenda: v.agenda.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="grid2">
        <div><label className="l">일시</label><input aria-label="일시" className="field" type="datetime-local" value={v.heldAt} onChange={(e) => onChange({ ...v, heldAt: e.target.value })} /></div>
        <div><label className="l">장소</label><input aria-label="장소" className="field" value={v.place} onChange={(e) => onChange({ ...v, place: e.target.value })} /></div>
        <div><label className="l">참석자</label><input aria-label="참석자" className="field" value={v.attendees} onChange={(e) => onChange({ ...v, attendees: e.target.value })} /></div>
      </div>
      <b>주요 안건 {record ? "와 회의 기록" : "(회의 전에 적어 주세요)"}</b>
      {v.agenda.map((a, i) => (
        <div key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="row">
            <input aria-label="안건" className="field" placeholder="안건 (회의 전 작성)" value={a.title} onChange={(e) => setA(i, { title: e.target.value })} />
            <button className="mini danger" type="button" style={{ minHeight: 54 }} onClick={() => onChange({ ...v, agenda: v.agenda.filter((_, j) => j !== i) })}>지우기</button>
          </div>
          {record ? (
            <div style={{ borderTop: "2px solid var(--line)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="small">회의 중에 기록해 주세요</span>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <label className="l" style={{ margin: 0 }} htmlFor={`st-${i}`}>상태</label>
                <select id={`st-${i}`} className="field" style={{ width: 180 }} value={a.status} onChange={(e) => setA(i, { status: e.target.value })}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
                <span className={`pill ${a.status === "논의 전" ? "gray" : a.status === "확정·실행완료" ? "ok" : a.status === "보류·삭제" ? "gray" : "warn"}`}>{a.status}</span>
              </div>
              <textarea aria-label="회의 내용" className="field" rows={3} style={{ padding: 10 }} placeholder="회의에서 나온 내용을 적어 주세요" value={a.note} onChange={(e) => setA(i, { note: e.target.value })} />
            </div>
          ) : null}
        </div>
      ))}
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => onChange({ ...v, agenda: [...v.agenda, { title: "", status: "논의 전", note: "" }] })}>+ 안건 추가</button>
      {record && (
        <>
          <div><label className="l">후속 조치</label><textarea aria-label="후속 조치" className="field" rows={2} style={{ padding: 10 }} value={v.followUp} onChange={(e) => onChange({ ...v, followUp: e.target.value })} /></div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label className="l" style={{ margin: 0 }} htmlFor="phase">회의 기록</label>
            <select id="phase" className="field" style={{ width: 200 }} value={v.phase} onChange={(e) => onChange({ ...v, phase: e.target.value })}>
              <option value="예정">예정·진행 중</option><option value="완료">완료</option>
            </select>
            <span className="small">완료로 바꾸려면 모든 안건의 상태를 정해야 해요.</span>
          </div>
        </>
      )}
    </div>
  );
}

function MinutesEditor() {
  const { items, setItems, note, create, save, remove } = useClub<Min>("minutes");
  const [add, setAdd] = useState<Omit<Min, "id">>({ ...BLANK_MIN });
  return (
    <>
      <Msg n={note} />
      <span className="small">회의록은 관리자만 볼 수 있어요. 안건은 회의 전에 적고, 회의 중에 안건마다 상태(확정·실행완료, 새로운 안건, 보류·삭제, 후속 조치)와 회의 내용을 기록해 주세요.</span>
      {!items && <p className="small">불러오는 중이에요…</p>}
      {items?.map((m) => (
        <details key={m.id} className="card">
          <summary style={{ fontWeight: 700, cursor: "pointer" }}>
            {m.heldAt.replace("T", " ")} · {m.place || "장소 미정"} · 안건 {m.agenda.length}개{" "}
            <span className={`pill ${m.phase === "완료" ? "ok" : "warn"}`}>{m.phase === "완료" ? "기록 완료" : `예정·진행 중${m.agenda.some((a) => a.status === "논의 전") ? ` · 논의 전 ${m.agenda.filter((a) => a.status === "논의 전").length}개` : ""}`}</span>
          </summary>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            <MinuteForm record v={m} onChange={(v) => setItems((l) => l && l.map((x) => (x.id === m.id ? { ...x, ...v } : x)))} />
            <div className="row"><button className="mini" type="button" onClick={() => save(m)}>저장</button><button className="mini danger" type="button" onClick={() => remove(m.id)}>회의록 지우기</button></div>
          </div>
        </details>
      ))}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 18px var(--display)" }}>+ 새 회의 (안건 미리 적기)</b>
        <MinuteForm record={false} v={add} onChange={setAdd} />
        <button className="btn" type="button" disabled={!add.heldAt} style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }} onClick={async () => { if (await create(add)) setAdd({ ...BLANK_MIN }); }}>추가</button>
      </div>
    </>
  );
}

function Club() {
  const [tab, setTab] = useState<Kind>("org");
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    api<{ members: Member[] }>("/api/admin/members").then((r) => r.ok && setMembers(r.data.members.map((m) => ({ id: m.id, name: m.name }))));
  }, []);
  return (
    <>
      <div className="tabsx" role="tablist" aria-label="원우회 운영 자료">
        {TABS.map((t) => <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)}>{t.l}</button>)}
      </div>
      {tab === "org" && <OrgEditor members={members} />}
      {tab === "rules" && <RulesEditor />}
      {tab === "minutes" && <MinutesEditor />}
    </>
  );
}

export default function ClubAdminPage() {
  return <AdminGate mode="members" need={["members", "minutes"]} active="/admin/club"><Club /></AdminGate>;
}
