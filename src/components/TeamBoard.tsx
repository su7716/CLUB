"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type M = { id: string; name: string; ageGroup: string };
type TeamsData = {
  poolKind: "selected" | "attending" | "all"; published: boolean; publishedAt: string; locked: boolean;
  teams: { id: string; name: string; members: M[] }[]; unassigned: M[]; participantCount: number;
};
type Col = { key: string; name: string; ids: string[] };
type Mode = "manual" | "mix" | "random";

const MODE_TEXT: Record<Mode, { label: string; hint: string }> = {
  manual: { label: "관리자 배정", hint: "빈 {u}만 만들어요. 회원을 끌어서 직접 넣어 주세요." },
  mix: { label: "연령대 섞기", hint: "연령대를 고르게 섞어서 나눠요. 회원 명단의 연령대를 사용해요." },
  random: { label: "랜덤 배정", hint: "무작위로 나눠요." },
};
const POOL_TEXT: Record<string, string> = { selected: "관리자 선택 회원", attending: "행사 참석 신청자", all: "전체 회원" };

// 팀(조) 구성 보드: 관리자 배정 / 연령대 섞기 / 랜덤 배정 → 끌어서 옮기기 → 확인으로 회원에게 배포.
// base 는 `.../teams`, `.../teams/publish` 를 가진 API 주소다(타임캡슐 팀 구성과 행사 조편성이 같이 쓴다).
export function TeamBoard({ base, canEdit, unit = "팀", screenHref }: { base: string; canEdit: boolean; unit?: string; screenHref?: string }) {
  const [td, setTd] = useState<TeamsData | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [mode, setMode] = useState<Mode>("random");
  const [by, setBy] = useState<"size" | "count">("size");
  const [size, setSize] = useState("4");
  const [count, setCount] = useState("3");
  const [cols, setCols] = useState<Col[]>([]);
  const [pool, setPool] = useState<string[]>([]);
  const [people, setPeople] = useState<Record<string, M>>({});
  const [dirty, setDirty] = useState(false);
  const [over, setOver] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const t = await api<TeamsData>(`${base}/teams`);
    if (!t.ok) return setMsg({ tone: "bad", text: t.error });
    setTd(t.data);
    const ppl: Record<string, M> = {};
    t.data.teams.forEach((tm) => tm.members.forEach((m) => (ppl[m.id] = m)));
    t.data.unassigned.forEach((m) => (ppl[m.id] = m));
    setPeople(ppl);
    setCols(t.data.teams.map((tm) => ({ key: tm.id, name: tm.name, ids: tm.members.map((m) => m.id) })));
    setPool(t.data.unassigned.map((m) => m.id));
    setDirty(false);
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  const editable = canEdit && !(td?.locked ?? false);

  // 회원을 다른 팀(또는 '없음')으로 옮긴다. 드래그와 선택 상자가 같은 함수를 쓴다.
  function move(memberId: string, to: string) {
    setCols((cs) => cs.map((c) => ({ ...c, ids: c.ids.filter((x) => x !== memberId) })).map((c) => (c.key === to ? { ...c, ids: [...c.ids, memberId] } : c)));
    setPool((p) => {
      const rest = p.filter((x) => x !== memberId);
      return to === "pool" ? [...rest, memberId] : rest;
    });
    setDirty(true);
  }
  function addTeam() {
    let n = cols.length + 1;
    while (cols.some((c) => c.name === `${n}${unit}`)) n++;
    setCols([...cols, { key: `new-${Date.now()}`, name: `${n}${unit}`, ids: [] }]);
    setDirty(true);
  }
  function removeTeam(key: string) {
    const col = cols.find((c) => c.key === key);
    if (!col || col.ids.length > 0) return;
    setCols(cols.filter((c) => c.key !== key));
    setDirty(true);
  }

  async function generate() {
    setBusy(true);
    const r = await api(`${base}/teams`, { body: by === "size" ? { mode, size: Number(size) } : { mode, count: Number(count) } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: mode === "manual" ? `빈 ${unit}을 만들었어요. 회원을 끌어서 넣어 주세요.` : `${unit}을 만들었어요. 끌어서 바꿀 수 있고, 마지막에 확인을 눌러야 배포돼요.` } : { tone: "bad", text: r.error });
    load();
  }
  async function saveDraft(): Promise<boolean> {
    const r = await api(`${base}/teams`, { method: "PUT", body: { teams: cols.map((c) => ({ name: c.name, memberIds: c.ids })) } });
    if (!r.ok) setMsg({ tone: "bad", text: r.error });
    return r.ok;
  }
  async function onSaveDraft() {
    setBusy(true);
    if (await saveDraft()) setMsg({ tone: "info", text: "초안을 저장했어요. 아직 회원에게는 보이지 않아요." });
    setBusy(false);
    load();
  }
  // 최종 확인: 화면의 구성을 저장하고 회원에게 배포한다.
  async function onConfirm() {
    setBusy(true);
    setMsg(null);
    if (dirty && !(await saveDraft())) return setBusy(false);
    const r = await api(`${base}/teams/publish`, { body: { action: "publish" } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: `${unit} 구성을 회원에게 배포했어요. 이제 회원 화면에 보여요.` } : { tone: "bad", text: r.error });
    load();
  }
  async function onUnpublish() {
    setBusy(true);
    const r = await api(`${base}/teams/publish`, { body: { action: "unpublish" } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "배포를 취소했어요." } : { tone: "bad", text: r.error });
    load();
  }

  if (!td) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const targets = [...cols.map((c) => ({ key: c.key, label: c.name })), { key: "pool", label: `${unit} 없음` }];
  // 주의: 컴포넌트가 아니라 함수로 그린다. 드래그하는 동안 화면이 다시 그려져도 끌고 있는 요소가 사라지지 않게 하려는 것이다.
  const person = (id: string, where: string) => {
    const m = people[id];
    if (!m) return null;
    return (
      <div key={id} draggable={editable} onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; }}
        className="row" style={{ border: "2px solid var(--line)", borderRadius: 12, padding: "4px 8px", background: "#fff", cursor: editable ? "grab" : "default", gap: 6 }}>
        <span className="grow" style={{ fontWeight: 700 }}>{m.name}{m.ageGroup ? <span className="small"> · {m.ageGroup}</span> : null}</span>
        {editable && (
          <select aria-label={`${m.name} 옮기기`} className="field" style={{ width: 96, minHeight: 36, fontSize: 14, padding: "0 6px" }} value={where} onChange={(e) => move(id, e.target.value)}>
            {targets.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        )}
      </div>
    );
  };
  const drop = (k: string, title: React.ReactNode, ids: string[], removable?: boolean) => (
    <div key={k} className="card"
      onDragOver={(e) => { if (editable) { e.preventDefault(); setOver(k); } }}
      onDragLeave={() => setOver("")}
      onDrop={(e) => { e.preventDefault(); setOver(""); const id = e.dataTransfer.getData("text/plain"); if (editable && id) move(id, k); }}
      style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 90, borderColor: over === k ? "var(--blue)" : undefined, background: over === k ? "var(--blue-bg)" : undefined }}>
      <div className="row"><b>{title}</b><span className="small">{ids.length}명</span><span className="grow" />{removable && editable && ids.length === 0 && <button className="mini danger" type="button" onClick={() => removeTeam(k)}>{unit} 지우기</button>}</div>
      {ids.map((id) => person(id, k))}
      {ids.length === 0 && <span className="hint">{editable ? "여기로 끌어 놓으세요" : "비어 있어요"}</span>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b style={{ font: "400 18px var(--display)" }}>{unit} 구성 ({td.participantCount}명 · {POOL_TEXT[td.poolKind]})</b>
        <span className={`pill ${td.published ? "ok" : "warn"}`}>{td.published ? "회원에게 배포됨" : "배포 전 (회원에게 안 보여요)"}</span>
        {td.locked && <span className="pill gray">작성이 시작되어 바꿀 수 없어요</span>}
      </div>

      {editable && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10, background: "var(--soft)" }}>
          <div className="pick" role="radiogroup" aria-label={`${unit} 구성 방식`} style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {(Object.keys(MODE_TEXT) as Mode[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} aria-pressed={mode === k} className="opt" style={{ width: "auto", flex: "1 1 160px", minHeight: 52 }} onClick={() => setMode(k)}>
                <span className="name">{mode === k ? "✓ " : ""}{MODE_TEXT[k].label}</span>
              </button>
            ))}
          </div>
          <span className="small">{MODE_TEXT[mode].hint.replace("{u}", unit)}</span>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <select className="field" aria-label="기준" style={{ width: 140 }} value={by} onChange={(e) => setBy(e.target.value as "size" | "count")}>
              <option value="size">{unit}당 인원</option><option value="count">{unit} 수</option>
            </select>
            {by === "size"
              ? <input className="field" aria-label={`${unit}당 인원`} type="number" min={2} max={20} style={{ width: 100 }} value={size} onChange={(e) => setSize(e.target.value)} />
              : <input className="field" aria-label={`${unit} 수`} type="number" min={1} max={30} style={{ width: 100 }} value={count} onChange={(e) => setCount(e.target.value)} />}
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={generate}>{cols.length > 0 ? "다시 만들기" : `${unit} 만들기`}</button>
            {screenHref && <Link href={screenHref} className="btn blue" style={{ width: "auto", minHeight: 48, fontSize: 17, textDecoration: "none" }}>큰 화면에 보여 주기 ⛶</Link>}
          </div>
        </div>
      )}

      {cols.length === 0 && <div className="msg info">아직 {unit}이 없어요. 위에서 방식을 고르고 만들어 주세요.</div>}
      {cols.length > 0 && (
        <>
          {editable && <span className="small">회원을 끌어서 다른 {unit}으로 옮길 수 있어요. 터치 화면에서는 이름 옆 선택 상자로 옮겨 주세요.</span>}
          <div className="cards">
            {cols.map((c) => drop(c.key, c.name, c.ids, true))}
            {drop("pool", `${unit} 없음`, pool)}
          </div>
          {editable && (
            <div className="row" style={{ flexWrap: "wrap" }}>
              <button className="btn white" type="button" style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={addTeam}>+ {unit} 추가</button>
              <button className="btn white" type="button" disabled={busy || !dirty} style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={onSaveDraft}>초안 저장</button>
              <button className="btn" type="button" disabled={busy || (td.published && !dirty)} style={{ width: "auto", minHeight: 48, fontSize: 17, minWidth: 140 }} onClick={onConfirm}>{td.published ? "변경 내용 다시 배포" : "확인 (회원에게 배포)"}</button>
              {td.published && !dirty && <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minHeight: 48, fontSize: 17 }} onClick={onUnpublish}>배포 취소</button>}
            </div>
          )}
          {editable && <span className="small">“확인”을 눌러야 회원 화면에 보여요. {unit}이 없는 사람이 남아 있거나 빈 {unit}이 있으면 배포되지 않아요.</span>}
        </>
      )}
    </div>
  );
}
