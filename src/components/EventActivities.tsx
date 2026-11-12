"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { TemplateConfig } from "@/lib/template-schema";
import { CapsuleAdmin } from "./CapsuleAdmin";
import { SCREEN_LABELS, TemplateEditor, type EditableConfig } from "./TemplateEditor";

type Act = {
  id: string;
  templateId: string;
  templateVersion: number;
  config: TemplateConfig;
  pre: { enabled: boolean; status: string; opensAt: string; closesAt: string };
  live: { active: boolean; stepKey: string; stepLabel: string; unlocked: boolean; memberScreen: string };
  startsAt: string;
  endsAt: string;
  rosterCount: number;
  attendanceConfirmed: boolean;
};
type Tpl = { id: string; config: TemplateConfig };
type Att = {
  confirmed: boolean; confirmedAt: string; by: string; selectedCount: number;
  members: { id: string; name: string; answer: string; days: string; selected: boolean }[];
};

const PRE_TEXT: Record<string, string> = {
  none: "현장에서만 진행 (사전 작성 없음)",
  unknown: "사전 작성 있음 · 행사 날짜가 정해지면 기간이 계산돼요",
  before: "사전 작성 시작 전",
  open: "사전 작성 중",
  closed: "사전 작성 마감",
};

// 활동의 날짜와 진행 시간. 회원에게 알려 주는 안내용 정보이고, 참여 대상과는 연결하지 않는다.
function Schedule({ eventId, a, canEdit, onChange }: { eventId: string; a: Act; canEdit: boolean; onChange: () => void }) {
  const [s, setS] = useState(a.startsAt);
  const [e, setE] = useState(a.endsAt);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);

  async function save() {
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}/schedule`, { method: "PUT", body: { startsAt: s, endsAt: e } });
    setMsg(r.ok ? { tone: "info", text: "활동 일시를 저장했어요." } : { tone: "bad", text: r.error });
    if (r.ok) onChange();
  }

  return (
    <div style={{ borderTop: "2px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <b style={{ font: "400 17px var(--display)" }}>활동 날짜와 진행 시간</b>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="grid2">
        <div><label className="l" htmlFor={`as-${a.id}`}>시작 일시</label><input id={`as-${a.id}`} className="field" type="datetime-local" value={s} disabled={!canEdit} onChange={(x) => setS(x.target.value)} /></div>
        <div><label className="l" htmlFor={`ae-${a.id}`}>끝나는 일시</label><input id={`ae-${a.id}`} className="field" type="datetime-local" value={e} disabled={!canEdit} onChange={(x) => setE(x.target.value)} /></div>
      </div>
      <span className="small">회원에게 보여 주는 안내용 정보예요. 참여 대상은 아래 “출석 체크”에서 따로 정해요.</span>
      {canEdit && <button className="mini" type="button" style={{ alignSelf: "flex-start" }} onClick={save}>일시 저장</button>}
    </div>
  );
}

// 출석 체크(참여 대상이 “관리자 선택 회원”일 때): 활동 전에 참여할 사람을 고르고 완료한다.
// 완료해야 사회자가 활동을 시작할 수 있고, 선택된 회원만 활동에 참여하고 정보가 노출된다.
function Attendance({ eventId, a, canEdit, onChange }: { eventId: string; a: Act; canEdit: boolean; onChange: () => void }) {
  const base = `/api/admin/events/${eventId}/activities/${a.id}/attendance`;
  const [att, setAtt] = useState<Att | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Att>(base);
    if (r.ok) {
      setAtt(r.data);
      setSel(new Set(r.data.members.filter((m) => m.selected).map((m) => m.id)));
      setDirty(false);
    } else setMsg({ tone: "bad", text: r.error });
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
    setDirty(true);
  };

  async function saveSel(): Promise<boolean> {
    const r = await api(base, { method: "PUT", body: { selected: [...sel] } });
    if (!r.ok) setMsg({ tone: "bad", text: r.error });
    return r.ok;
  }
  async function onSave() {
    setBusy(true);
    if (await saveSel()) setMsg({ tone: "info", text: "선택한 사람을 저장했어요." });
    setBusy(false);
    await load();
    onChange();
  }
  async function preset() {
    setBusy(true);
    const r = await api(base, { method: "PUT", body: { preset: "applicants" } });
    setMsg(r.ok ? { tone: "info", text: "행사에 참석을 신청한 회원으로 채웠어요. 필요하면 고쳐 주세요." } : { tone: "bad", text: r.error });
    setBusy(false);
    await load();
    onChange();
  }
  async function confirm(confirmed: boolean) {
    setBusy(true);
    setMsg(null);
    if (confirmed && dirty && !(await saveSel())) return setBusy(false);
    const r = await api(base, { body: { confirmed } });
    setMsg(r.ok ? { tone: "info", text: confirmed ? "출석 체크를 완료했어요. 이제 활동을 시작할 수 있어요." : "출석 체크 완료를 취소했어요." } : { tone: "bad", text: r.error });
    setBusy(false);
    await load();
    onChange();
  }

  if (!att) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : null;

  return (
    <div style={{ borderTop: "2px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b style={{ font: "400 17px var(--display)" }}>출석 체크 (참여할 사람 선택)</b>
        <span className="pill blue">선택 {sel.size}명</span>
        <span className={`pill ${att.confirmed ? "ok" : "warn"}`}>{att.confirmed ? "완료" : "활동 전에 완료해 주세요"}</span>
      </div>
      {!att.confirmed && <div className="msg info">참여할 사람을 고르고 “출석 체크 완료”를 눌러야 사회자가 활동을 시작할 수 있어요. 선택하지 않은 회원은 활동에 들어가지 않아요.</div>}
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {canEdit && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="mini" type="button" disabled={busy} onClick={preset}>행사 참석 신청자로 채우기</button>
          <button className="mini" type="button" onClick={() => { setSel(new Set(att.members.map((m) => m.id))); setDirty(true); }}>전체 선택</button>
          <button className="mini" type="button" onClick={() => { setSel(new Set()); setDirty(true); }}>전체 해제</button>
        </div>
      )}
      <div className="checks" role="group" aria-label="참여할 사람">
        {att.members.map((m) => (
          <label key={m.id} style={sel.has(m.id) ? { borderColor: "var(--blue)", background: "var(--blue-bg)" } : undefined}>
            <input type="checkbox" checked={sel.has(m.id)} disabled={!canEdit} onChange={() => toggle(m.id)} />
            {m.name}
            {m.answer && <span className={`pill ${m.answer === "참석" ? "ok" : "gray"}`}>{m.answer === "참석" ? "행사 신청" : "불참"}</span>}
          </label>
        ))}
      </div>
      {canEdit && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn white" type="button" disabled={busy || !dirty} style={{ width: "auto", minHeight: 46, fontSize: 16 }} onClick={onSave}>선택 저장</button>
          {!att.confirmed
            ? <button className="btn" type="button" disabled={busy || sel.size === 0} style={{ width: "auto", minHeight: 46, fontSize: 16 }} onClick={() => confirm(true)}>출석 체크 완료</button>
            : <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minHeight: 46, fontSize: 16 }} onClick={() => confirm(false)}>완료 취소</button>}
        </div>
      )}
      {att.confirmed && <span className="small">{att.confirmedAt.slice(0, 16).replace("T", " ")} · {att.by} 님이 완료했어요. 늦게 온 분은 선택해서 저장하면 바로 참여할 수 있어요.</span>}
    </div>
  );
}


// 소개 작성 현황(인원 수만). 승인 전 초안과 인터뷰 내용은 관리자에게도 보이지 않는다.
function Progress({ eventId, aid }: { eventId: string; aid: string }) {
  const [p, setP] = useState<{ total: number; approved: number; writing: number; notStarted: number; guessers: number } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof p>>(`/api/admin/events/${eventId}/activities/${aid}/progress`).then((r) => r.ok && setP(r.data));
  }, [eventId, aid]);
  if (!p) return null;
  return (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <span className="pill ok">승인 {p.approved}명</span>
      <span className="pill warn">작성 중 {p.writing}명</span>
      <span className="pill gray">미작성 {p.notStarted}명</span>
      <span className="pill blue">맞히기 참여 {p.guessers}명</span>
      <span className="small">전체 {p.total}명 · 내용은 관리자에게도 보이지 않아요</span>
    </div>
  );
}

// 행사 관리의 '활동' 탭: 템플릿에서 활동 추가, 행사별 수정, 사회자 컨트롤(시험 조작)
export function EventActivities({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const [acts, setActs] = useState<Act[] | null>(null);
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [pick, setPick] = useState("");
  const [edit, setEdit] = useState<{ id: string; value: EditableConfig } | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([
      api<{ activities: Act[] }>(`/api/admin/events/${eventId}/activities`),
      api<{ templates: Tpl[] }>("/api/admin/templates"),
    ]);
    if (a.ok) setActs(a.data.activities);
    else setMsg({ tone: "bad", text: a.error });
    if (t.ok) {
      setTpls(t.data.templates);
      setPick((p) => p || t.data.templates[0]?.id || "");
    }
  }, [eventId]);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setBusy(true);
    const r = await api(`/api/admin/events/${eventId}/activities`, { body: { templateId: pick } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "활동을 넣었어요. 템플릿 설정이 복사돼서 이 행사에서만 따로 고칠 수 있어요." } : { tone: "bad", text: r.error });
    load();
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    const r = await api(`/api/admin/events/${eventId}/activities/${edit.id}`, { method: "PATCH", body: edit.value });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "이 행사의 활동 설정을 저장했어요." });
    setEdit(null);
    load();
  }

  async function remove(a: Act) {
    if (!window.confirm(`“${a.config.name}” 활동을 이 행사에서 뺄까요?`)) return;
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}`, { method: "DELETE" });
    setMsg(r.ok ? { tone: "info", text: "뺐어요." } : { tone: "bad", text: r.error });
    load();
  }

  async function live(a: Act, body: { action: "activate"; step: string } | { action: "lock" } | { action: "reset" }) {
    const r = await api(`/api/admin/events/${eventId}/activities/${a.id}/live`, { body });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg(null);
    load();
  }

  if (edit) {
    return (
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <b style={{ font: "400 21px var(--display)" }}>이 행사의 활동 설정 수정</b>
        <span className="small">여기서 고친 내용은 이 행사에만 적용돼요. 템플릿 보관함은 바뀌지 않아요.</span>
        {msg && <div className={`msg ${msg.tone}`} role="alert">{msg.text}</div>}
        <TemplateEditor value={edit.value} onChange={(value) => setEdit({ ...edit, value })} />
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 160 }} onClick={saveEdit}>저장</button>
          <button className="btn white" type="button" style={{ width: "auto", minWidth: 120 }} onClick={() => setEdit(null)}>취소</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        활동 템플릿에서 활동을 골라 이 행사에 넣어요. 넣은 뒤 이 행사에 맞게 고칠 수 있어요.
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      {!acts && !msg && <p className="small">불러오는 중이에요…</p>}
      {acts && acts.length === 0 && <div className="msg info">아직 넣은 활동이 없어요. 아래에서 템플릿을 골라 추가해 보세요.</div>}

      {acts?.map((a) => (
        <div key={a.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <b style={{ font: "400 21px var(--display)" }}>{a.config.name}</b>
            <span className="pill gray">템플릿 v{a.templateVersion}</span>
            <span className={`pill ${a.pre.enabled ? "blue" : "warn"}`}>{a.pre.enabled ? "사전 작성 있음" : "현장에서만"}</span>
            <span className="grow" />
            {canEdit && (
              <>
                <button className="mini" type="button" onClick={() => { const { id: _i, version: _v, ...rest } = a.config; void _i; void _v; setEdit({ id: a.id, value: rest }); }}>수정</button>
                <button className="mini danger" type="button" onClick={() => remove(a)}>빼기</button>
              </>
            )}
          </div>
          <span className="small">{PRE_TEXT[a.pre.status]}{a.pre.opensAt ? ` · ${a.pre.opensAt} ~ ${a.pre.closesAt}` : ""}</span>
          {a.config.preEvent.steps.includes("ai_interview") && <Progress eventId={eventId} aid={a.id} />}
          <span className={`pill ${a.config.participants === "selected" ? "warn" : "gray"}`} style={{ alignSelf: "flex-start" }}>
            참여 대상: {a.config.participants === "selected" ? `관리자 선택 회원 (${a.rosterCount}명${a.attendanceConfirmed ? " · 출석 체크 완료" : " · 출석 체크 필요"})` : "전체 회원"}
          </span>
          {a.config.participants === "selected" && <Attendance eventId={eventId} a={a} canEdit={canEdit} onChange={load} />}
          <Schedule eventId={eventId} a={a} canEdit={canEdit} onChange={load} />
          {a.config.preEvent.steps.includes("worry_write") && (
            <Link href={`/host/worry/${eventId}/${a.id}`} className="btn blue" style={{ width: "auto", alignSelf: "flex-start", minHeight: 50, fontSize: 18, textDecoration: "none" }}>
              사회자 전체화면 열기 (고민 뽑기) ⛶
            </Link>
          )}
          {!a.config.preEvent.steps.includes("ai_interview") && !a.config.preEvent.steps.includes("worry_write") && a.config.onsite.steps.some((s) => s.memberScreen === "write") && (
            <CapsuleAdmin eventId={eventId} aid={a.id} canEdit={canEdit} />
          )}
          {a.config.preEvent.steps.includes("ai_interview") && (
            <Link href={`/host/${eventId}/${a.id}`} className="btn blue" style={{ width: "auto", alignSelf: "flex-start", minHeight: 50, fontSize: 18, textDecoration: "none" }}>
              사회자 전체화면 열기 ⛶
            </Link>
          )}

          <div style={{ borderTop: "2px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <b style={{ font: "400 17px var(--display)" }}>사회자 컨트롤</b>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {a.config.onsite.steps.filter((s) => s.hostButton).map((s) => (
                <button key={s.key} className={`btn ${a.live.stepKey === s.key && a.live.unlocked ? "blue" : ""}`} type="button" style={{ width: "auto", minWidth: 140, minHeight: 48, fontSize: 18 }} onClick={() => live(a, { action: "activate", step: s.key })}>
                  {s.hostButton}
                </button>
              ))}
              <button className="btn red" type="button" disabled={!a.live.active || !a.live.unlocked} style={{ width: "auto", minWidth: 110, minHeight: 48, fontSize: 18 }} onClick={() => live(a, { action: "lock" })}>잠그기</button>
              <button className="btn white" type="button" disabled={!a.live.active} style={{ width: "auto", minWidth: 110, minHeight: 48, fontSize: 18 }} onClick={() => live(a, { action: "reset" })}>처음으로</button>
            </div>
            <div className="msg info" role="status">
              {a.live.active
                ? `현재 단계: ${a.live.stepLabel} · 회원 화면: ${a.live.unlocked ? `켜짐 (${SCREEN_LABELS[a.live.memberScreen] ?? a.live.memberScreen})` : "잠김 (대기 화면)"}`
                : "현장 진행 전이에요. 버튼을 누르면 회원 화면이 템플릿 설정대로 바뀌어요."}
            </div>
          </div>
        </div>
      ))}

      {canEdit && tpls.length > 0 && (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: "400 19px var(--display)" }}>+ 템플릿에서 활동 추가</b>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <select className="field" aria-label="활동 템플릿" style={{ flex: 1, minWidth: 220 }} value={pick} onChange={(e) => setPick(e.target.value)}>
              {tpls.map((t) => <option key={t.id} value={t.id}>{t.config.name}</option>)}
            </select>
            <button className="btn" type="button" disabled={busy || !pick} style={{ width: "auto", minWidth: 140 }} onClick={add}>추가</button>
          </div>
        </div>
      )}
    </>
  );
}
