"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate, PERM_LABELS } from "@/components/AdminGate";
import { api } from "@/lib/client";

type M = {
  id: string; no: string; name: string; kind: string; position: string; gender: string;
  company: string; title: string; birth: string; phone: string; ageGroup: string; perms: string[];
};
type Kind = { value: string; definition: string };

const EMPTY: Omit<M, "id" | "no"> = {
  name: "", kind: "", position: "", gender: "", company: "", title: "", birth: "", phone: "", ageGroup: "", perms: [],
};
const PERM_KEYS = ["all", "members", "events", "fees", "activities", "minutes"];

function Members() {
  const [list, setList] = useState<M[] | null>(null);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [meAll, setMeAll] = useState(false);
  const [form, setForm] = useState<Omit<M, "id" | "no">>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("전체");

  const load = useCallback(async () => {
    const [m, s, me] = await Promise.all([
      api<{ members: M[] }>("/api/admin/members"),
      api<{ memberKinds: Kind[] }>("/api/admin/settings"),
      api<{ perms: string[] }>("/api/me"),
    ]);
    if (m.ok) setList(m.data.members);
    else setMsg({ tone: "bad", text: m.error });
    if (s.ok) setKinds(s.data.memberKinds);
    if (me.ok) setMeAll(me.data.perms.includes("all"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function startEdit(m: M) {
    setEditId(m.id);
    const { id: _id, no: _no, ...rest } = m;
    void _id; void _no;
    setForm(rest);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() {
    setEditId(null);
    setForm(EMPTY);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const r = editId
      ? await api(`/api/admin/members/${editId}`, { method: "PATCH", body: form })
      : await api("/api/admin/members", { body: form });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: editId ? "저장했어요." : "회원을 추가했어요." });
    reset();
    load();
  }

  async function remove(m: M) {
    if (!window.confirm(`${m.name} 님을 명단에서 지울까요?`)) return;
    const r = await api(`/api/admin/members/${m.id}`, { method: "DELETE" });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "지웠어요." });
    load();
  }

  const counts = new Map<string, number>();
  list?.forEach((m) => counts.set(m.kind || "미지정", (counts.get(m.kind || "미지정") ?? 0) + 1));
  const shown = list?.filter((m) => filter === "전체" || (m.kind || "미지정") === filter) ?? [];
  const admins = list?.filter((m) => m.perms.length > 0) ?? [];

  return (
    <>
      <p className="small" style={{ margin: 0 }}>회원정보(회사·연락처·생년월일)는 관리자에게만 보이고 일반 회원에게는 노출되지 않아요.</p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      <div className="cards">
        <div className="card"><span className="small">전체</span><div className="big">{list?.length ?? "-"}명</div></div>
        {[...counts.entries()].map(([k, n]) => (
          <div className="card" key={k}><span className="small">{k}</span><div className="big">{n}명</div></div>
        ))}
        <div className="card"><span className="small">관리자</span><div className="big">{admins.length} / 5</div></div>
      </div>

      <form className="card" onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: "400 20px var(--display)" }}>{editId ? "회원 수정" : "회원 추가"}</b>
        <div className="grid2">
          <div><label className="l" htmlFor="f-name">성명</label><input id="f-name" className="field" value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div>
            <label className="l" htmlFor="f-kind">회원구분</label>
            <select id="f-kind" className="field" value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="">선택 안 함</option>
              {kinds.map((k) => <option key={k.value} value={k.value}>{k.value}</option>)}
            </select>
          </div>
          <div><label className="l" htmlFor="f-pos">원우회 직책</label><input id="f-pos" className="field" value={form.position} onChange={(e) => set("position", e.target.value)} /></div>
          <div>
            <label className="l" htmlFor="f-gender">성별</label>
            <select id="f-gender" className="field" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
              <option value="">선택 안 함</option><option>남</option><option>여</option>
            </select>
          </div>
          <div><label className="l" htmlFor="f-co">회사명</label><input id="f-co" className="field" value={form.company} onChange={(e) => set("company", e.target.value)} /></div>
          <div><label className="l" htmlFor="f-ti">직위</label><input id="f-ti" className="field" value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div><label className="l" htmlFor="f-birth">생년월일</label><input id="f-birth" className="field" placeholder="1970-01-01" value={form.birth} onChange={(e) => set("birth", e.target.value)} /></div>
          <div><label className="l" htmlFor="f-phone">연락처</label><input id="f-phone" className="field" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div><label className="l" htmlFor="f-age">연령대 (팀 구성에 사용)</label><input id="f-age" className="field" placeholder="50대" value={form.ageGroup} onChange={(e) => set("ageGroup", e.target.value)} /></div>
        </div>
        <div>
          <span className="l">관리자 권한 (여러 개 선택 · 모든 권한 관리자만 바꿀 수 있어요)</span>
          <div className="checks">
            {PERM_KEYS.map((p) => (
              <label key={p}>
                <input type="checkbox" disabled={!meAll} checked={form.perms.includes(p)}
                  onChange={(e) => set("perms", e.target.checked ? [...form.perms, p] : form.perms.filter((x) => x !== p))} />
                {PERM_LABELS[p]}
              </label>
            ))}
          </div>
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={busy || !form.name.trim()} style={{ width: "auto", minWidth: 160 }}>{editId ? "저장" : "추가"}</button>
          {editId && <button className="btn white" type="button" style={{ width: "auto", minWidth: 120 }} onClick={reset}>취소</button>}
        </div>
      </form>

      <div className="subnav" aria-label="회원구분 보기">
        {["전체", ...kinds.map((k) => k.value), "미지정"].map((k) => (
          <a key={k} className={filter === k ? "on" : ""} href="#" onClick={(e) => { e.preventDefault(); setFilter(k); }}>{k}</a>
        ))}
      </div>

      {!list && <p className="small">불러오는 중이에요…</p>}
      {list && shown.length === 0 && <div className="msg info">해당하는 회원이 없어요.</div>}
      {shown.length > 0 && (
        <div className="tblw">
          <table className="tbl" style={{ minWidth: 900 }}>
            <thead><tr><th>NO</th><th>성명</th><th>구분</th><th>직책</th><th>성별</th><th>회사명</th><th>직위</th><th>생년월일</th><th>연락처</th><th>권한</th><th></th></tr></thead>
            <tbody>
              {shown.map((m) => (
                <tr key={m.id}>
                  <td className="num">{m.no}</td><td><b>{m.name}</b></td><td>{m.kind}</td><td>{m.position}</td><td>{m.gender}</td>
                  <td>{m.company}</td><td>{m.title}</td><td className="num">{m.birth}</td><td className="num">{m.phone}</td>
                  <td>{m.perms.map((p) => <span key={p} className="pill blue" style={{ marginRight: 4 }}>{PERM_LABELS[p]}</span>)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="mini" type="button" onClick={() => startEdit(m)}>수정</button>{" "}
                    <button className="mini danger" type="button" onClick={() => remove(m)}>삭제</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function MembersPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/members"><Members /></AdminGate>;
}
