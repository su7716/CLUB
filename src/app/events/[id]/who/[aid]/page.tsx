"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";
import { useVoice } from "@/lib/voice";

type Msg = { role: "ai" | "me"; text: string; scope?: "intro" | "truthlie" | "none" };
type State = {
  activity: { id: string; name: string };
  event: { id: string; name: string };
  pre: { status: string; opensAt: string; closesAt: string };
  guess: { status: string; opensAt: string; closesAt: string };
  aiEnabled: boolean;
  inActivity: boolean; // 이 활동의 참여 대상인지(아니면 프로필 북용 소개만 작성)
  participants: string;
  profile: { alias: string; draftMd: string; introMd: string; introStatus: string };
  interview: { messages: Msg[]; status: string; answered: number; required: number };
  truthLies: { statements: string[]; lieIndex: number; status: string };
};
type Target = { profileId: string; alias: string; introMd: string; myChoice: string };
type Cand = { id: string; name: string; trip: string };
type Note = { tone: "bad" | "info"; text: string } | null;

const WHEN: Record<string, string> = {
  before: "아직 작성 기간이 아니에요.",
  closed: "작성 기간이 끝났어요.",
  unknown: "행사 날짜가 정해지면 작성 기간이 열려요.",
  none: "이 활동에는 사전 작성이 없어요.",
};
const SCOPE_LABEL = { intro: "소개 페이지에 공개", truthlie: "2진실 1거짓용으로만", none: "사용 안 함" } as const;

export default function WhoPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const router = useRouter();
  const [st, setSt] = useState<State | null>(null);
  const [tab, setTab] = useState<"write" | "guess">("write");
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<State>(`/api/who/${aid}`);
    if (r.ok) setSt(r.data);
    else if (r.status === 401) router.replace("/");
    else setNote({ tone: "bad", text: r.error });
  }, [aid, router]);
  useEffect(() => {
    load();
  }, [load]);

  if (!st) {
    return (
      <main className="app">
        {note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>}
        <button className="btn white" type="button" onClick={() => router.push(`/events/${id}`)}>‹ 행사로 돌아가기</button>
      </main>
    );
  }

  return (
    <main className="app">
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => router.push(`/events/${id}`)}>
        ‹ {st.event.name}
      </button>
      <h1 className="title" style={{ fontSize: 24 }}>{st.activity.name}</h1>
      <div className="subnav" role="tablist" aria-label="내가 누굴까요? 메뉴" style={{ display: "flex", gap: 6 }}>
        <a href="#" role="tab" aria-selected={tab === "write"} className={tab === "write" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("write"); }}>내 소개 작성</a>
        <a href="#" role="tab" aria-selected={tab === "guess"} className={tab === "guess" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("guess"); }}>누구일까요?</a>
      </div>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      {tab === "write" ? (
        <Write st={st} aid={aid} busy={busy} setBusy={setBusy} setNote={setNote} reload={load} />
      ) : (
        <Guess aid={aid} setNote={setNote} />
      )}
    </main>
  );
}

/* ───────────── 내 소개 작성 ───────────── */
function Write(props: {
  st: State; aid: string; busy: boolean; setBusy: (b: boolean) => void; setNote: (n: Note) => void; reload: () => Promise<void>;
}) {
  const { st, aid, busy, setBusy, setNote, reload } = props;
  const open = st.pre.status === "open";
  const approved = st.profile.introStatus === "approved";
  const inAct = st.inActivity;

  const [alias, setAlias] = useState(st.profile.alias);
  const [intro, setIntro] = useState(st.profile.introStatus === "approved" ? st.profile.introMd : st.profile.draftMd);
  const [stmts, setStmts] = useState<string[]>(st.truthLies.statements);
  const [lie, setLie] = useState(st.truthLies.lieIndex);
  const [scopes, setScopes] = useState<Record<string, "intro" | "truthlie" | "none">>({});
  const [reviseText, setReviseText] = useState("");
  const [answer, setAnswer] = useState("");
  const [editAlias, setEditAlias] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [st.interview.messages.length]);

  const voice = useVoice(() => answer, setAnswer);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setNote(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  const saveAlias = () => run(async () => {
    const r = await api(`/api/who/${aid}/alias`, { body: { alias } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setEditAlias(false);
    await reload();
  });

  const startInterview = () => run(async () => {
    const r = await api(`/api/who/${aid}/interview`, { body: {} });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    await reload();
  });

  const sendAnswer = () => run(async () => {
    if (voice.listening) voice.toggle();
    const r = await api(`/api/who/${aid}/interview`, { body: { answer } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setAnswer("");
    await reload();
  });

  const makeDraft = () => run(async () => {
    const r = await api<{ mode: string; draftMd: string; statements: string[]; lieIndex: number; remaining: string[] }>(`/api/who/${aid}/draft`, { body: {} });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setIntro(r.data.draftMd);
    setStmts(r.data.statements);
    setLie(r.data.lieIndex);
    setNote({
      tone: "info",
      text: r.data.mode === "manual"
        ? "AI가 아직 연결되지 않아 내 답변을 모아 초안을 만들었어요. 직접 다듬고, 2진실 1거짓 문장 3개를 적어 주세요."
        : "초안을 만들었어요. 읽어 보고 고칠 부분을 알려 주세요.",
    });
    await reload();
  });

  const saveDraft = (silent = false) => run(async () => {
    const r = await api(`/api/who/${aid}/draft`, { method: "PUT", body: { introMd: intro, scopes, ...(inAct ? { statements: stmts, lieIndex: lie } : {}) } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    if (!silent) setNote({ tone: "info", text: "저장했어요. 승인하기 전에는 다른 회원에게 보이지 않아요." });
    await reload();
  });

  const revise = () => run(async () => {
    const r = await api<{ introMd: string }>(`/api/who/${aid}/revise`, { body: { request: reviseText, introMd: intro } });
    if (r.ok) {
      setIntro(r.data.introMd);
      setReviseText("");
      return setNote({ tone: "info", text: "요청대로 고쳤어요. 마음에 들면 최종 배포를 눌러 주세요." });
    }
    setNote({ tone: "bad", text: r.error });
  });

  const approve = () => run(async () => {
    const r = await api(`/api/who/${aid}/approve`, { body: { introMd: intro, ...(inAct ? { statements: stmts, lieIndex: lie } : {}) } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: "배포했어요. 이제 다른 회원이 별칭으로 내 소개를 읽을 수 있어요." });
    await reload();
  });

  const unapprove = () => run(async () => {
    const r = await api(`/api/who/${aid}/approve`, { method: "DELETE" });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: "승인을 취소했어요. 다시 고치고 배포할 수 있어요." });
    await reload();
  });

  if (!open) {
    return (
      <div className="msg info">
        {WHEN[st.pre.status] ?? ""}{st.pre.opensAt ? ` 작성 기간은 ${st.pre.opensAt} ~ ${st.pre.closesAt} 예요.` : ""}
        {approved && " 승인된 소개는 그대로 공개돼 있어요."}
      </div>
    );
  }

  const iv = st.interview;
  const hasAlias = Boolean(st.profile.alias);
  const interviewDone = iv.status === "done";
  const inInterview = hasAlias && !interviewDone && iv.messages.length > 0;
  const hasDraft = st.profile.introStatus === "draft" || approved || intro.trim().length > 0;

  return (
    <>
      {!inAct && (
        <div className="msg info" role="status">이 활동에는 참여하지 않아요(참여 대상으로 선택되지 않았어요). 프로필 북에 실릴 소개만 작성해요. 2진실 1거짓은 필요 없어요.</div>
      )}
      {!st.aiEnabled && (
        <div className="msg info" role="status">AI가 아직 연결되지 않아 정해진 질문으로 진행해요. 소개 글은 내 답변을 모아 초안을 만들고 직접 다듬어요.</div>
      )}

      {/* 1. 별칭 */}
      {(!hasAlias || editAlias) && !approved ? (
        <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row"><Mascot size={48} /><b style={{ font: "400 20px var(--display)" }}>별칭을 정해 주세요</b></div>
          <span className="small">이름과 회사명이 드러나면 안 되고, 다른 회원과 겹치면 안 돼요.</span>
          <label className="l" htmlFor="alias">별칭</label>
          <input id="alias" className="field" value={alias} maxLength={20} onChange={(e) => setAlias(e.target.value)} placeholder="예: 평상 위의 독서가" />
          <button className="btn" type="button" disabled={busy || alias.trim().length < 2} onClick={saveAlias}>별칭 정하기</button>
        </section>
      ) : (
        <div className="card row" style={{ flexWrap: "wrap" }}>
          <span className="small">내 별칭</span><b style={{ font: "400 20px var(--display)" }}>{st.profile.alias}</b>
          <span className="grow" />
          {!approved && <button className="mini" type="button" onClick={() => setEditAlias(true)}>바꾸기</button>}
        </div>
      )}

      {/* 2. 인터뷰 */}
      {hasAlias && !interviewDone && (
        <section aria-label="인터뷰" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {iv.messages.length === 0 ? (
            <>
              <div className="msg info">질문에 답하면 소개 글을 만들 수 있어요. 약 10분이면 끝나고, 중간에 나가도 저장돼서 이어서 쓸 수 있어요. 이름과 회사명은 쓰지 않아도 돼요.</div>
              <button className="btn" type="button" disabled={busy} onClick={startInterview}>인터뷰 시작하기</button>
            </>
          ) : (
            <>
              <div className="row">
                <div className="meter" style={{ flex: 1, height: 14, background: "var(--line)", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, (iv.answered / Math.max(1, iv.required)) * 100)}%`, height: "100%", background: "var(--green)" }} />
                </div>
                <span className="small num">{iv.answered}/{iv.required}</span>
              </div>
              <div role="log" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {iv.messages.map((m, i) =>
                  m.role === "ai" ? (
                    <div key={i} className="row" style={{ alignItems: "flex-end" }}>
                      <Mascot size={44} />
                      <div className="card" style={{ fontWeight: 700, borderRadius: 16 }}>{m.text}</div>
                    </div>
                  ) : (
                    <div key={i} style={{ alignSelf: "flex-end", maxWidth: "88%", background: "var(--blue-bg)", color: "var(--blue-t)", border: "2px solid #9adcf9", borderRadius: 16, padding: "10px 14px", fontWeight: 700 }}>{m.text}</div>
                  ),
                )}
                <div ref={chatEnd} />
              </div>
              <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label className="l" htmlFor="ans">내 답변</label>
                <textarea id="ans" className="field" rows={3} style={{ padding: 12, lineHeight: 1.5 }} value={answer} onChange={(e) => setAnswer(e.target.value)} />
                <p className="hint" role="status">
                  {voice.note || (voice.supported
                    ? voice.listening ? "듣고 있어요. 말씀이 끝나면 마이크를 한 번 더 눌러 주세요." : "마이크를 누르고 말씀하세요. 말한 내용이 위 입력창에 글자로 나와요. 확인하고 고친 뒤 보내 주세요."
                    : "이 기기에서는 음성 입력을 쓸 수 없어요. 키보드로 입력해 주세요.")}
                </p>
                <div className="row">
                  {voice.supported && (
                    <button type="button" className="btn white" aria-label={voice.listening ? "음성 입력 멈추기" : "음성으로 입력"} aria-pressed={voice.listening}
                      style={{ width: 64, flex: "none", ...(voice.listening ? { background: "var(--red)", color: "#3d0505", borderColor: "var(--red-d)" } : {}) }} onClick={voice.toggle}>
                      {voice.listening ? "■" : "🎤"}
                    </button>
                  )}
                  <button className="btn" type="button" disabled={busy || !answer.trim()} onClick={sendAnswer}>보내기</button>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* 3. 초안 만들기 */}
      {hasAlias && interviewDone && !hasDraft && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="msg info">인터뷰를 마쳤어요. 이제 소개 글을 만들어요.</div>
          <button className="btn" type="button" disabled={busy} onClick={makeDraft}>{busy ? "만드는 중…" : "소개 글 만들기"}</button>
        </section>
      )}

      {/* 4. 미리보기 · 수정 · 승인 */}
      {hasAlias && interviewDone && hasDraft && (
        <section aria-label="미리보기와 승인" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <b style={{ font: "400 21px var(--display)" }}>소개 글</b>
            <span className={`pill ${approved ? "ok" : "warn"}`}>{approved ? "배포됨 ✓" : "초안 (나만 보여요)"}</span>
          </div>
          <label className="l" htmlFor="intro">소개 글 (직접 고칠 수 있어요)</label>
          <textarea id="intro" className="field" rows={10} style={{ padding: 12, lineHeight: 1.6 }} value={intro} disabled={approved} onChange={(e) => setIntro(e.target.value)} />

          {!approved && (
            <div className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label className="l" htmlFor="rev">고치고 싶은 점 (예: 더 짧게, 말투를 부드럽게)</label>
              <input id="rev" className="field" value={reviseText} onChange={(e) => setReviseText(e.target.value)} />
              <button className="btn blue" type="button" disabled={busy || !reviseText.trim()} onClick={revise}>이렇게 고쳐 주세요</button>
            </div>
          )}

          {inAct && (
            <>
              <b style={{ font: "400 21px var(--display)" }}>2진실 1거짓</b>
              <span className="small">소개 글에 쓰지 않은 내용으로 문장 3개를 적고, 거짓인 문장 하나를 골라 주세요. 너무 뻔하거나 실례가 되는 거짓은 피해 주세요.</span>
              {stmts.map((t, i) => (
                <div key={i} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, borderColor: lie === i ? "var(--red)" : undefined }}>
                  <label className="l" htmlFor={`st-${i}`}>문장 {i + 1}</label>
                  <input id={`st-${i}`} className="field" value={t} disabled={approved} onChange={(e) => setStmts(stmts.map((x, j) => (j === i ? e.target.value : x)))} />
                  <label className="row" style={{ gap: 8 }}>
                    <input type="radio" name="lie" checked={lie === i} disabled={approved} onChange={() => setLie(i)} style={{ width: 22, height: 22 }} />
                    <span style={{ fontWeight: 700 }}>이 문장이 거짓이에요</span>
                  </label>
                </div>
              ))}
            </>
          )}

          {!approved && iv.messages.some((m) => m.role === "me") && (
            <details className="card">
              <summary style={{ fontWeight: 700, cursor: "pointer" }}>내 답변별 공개 범위 (선택)</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {iv.messages.map((m, i) => m.role === "me" ? (
                  <div key={i}>
                    <div className="small">{iv.messages[i - 1]?.text}</div>
                    <div style={{ fontWeight: 700 }}>{m.text}</div>
                    <select className="field" aria-label="공개 범위" value={scopes[String(i)] ?? m.scope ?? "intro"} onChange={(e) => setScopes({ ...scopes, [String(i)]: e.target.value as "intro" })}>
                      {Object.entries(SCOPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                ) : null)}
                <span className="small">저장하면 반영돼요. 다음에 소개 글을 다시 만들 때 이 범위대로 사용해요.</span>
              </div>
            </details>
          )}

          <div className="footer-actions">
            {approved ? (
              <button className="btn white" type="button" disabled={busy} onClick={unapprove}>승인 취소하고 다시 고치기</button>
            ) : (
              <>
                <button className="btn white" type="button" disabled={busy} onClick={() => saveDraft()}>임시 저장</button>
                <button className="btn" type="button" disabled={busy || intro.trim().length < 20 || (inAct && stmts.some((s) => s.trim().length < 2))} onClick={approve}>최종 배포하겠습니다</button>
                <p className="hint center">승인하기 전에는 다른 회원과 관리자에게 보이지 않아요. 승인 뒤에도 취소하고 다시 고칠 수 있어요.</p>
              </>
            )}
          </div>
        </section>
      )}
    </>
  );
}

/* ───────────── 누구일까요? (사전 추측) ───────────── */
function Guess({ aid, setNote }: { aid: string; setNote: (n: Note) => void }) {
  const [data, setData] = useState<{ guess: { status: string; opensAt: string; closesAt: string }; targets: Target[]; candidates: Cand[]; notJoin?: boolean } | null>(null);
  const [openId, setOpenId] = useState("");

  const load = useCallback(async () => {
    const r = await api<NonNullable<typeof data>>(`/api/who/${aid}/guess`);
    if (r.ok) setData(r.data);
    else setNote({ tone: "bad", text: r.error });
  }, [aid, setNote]);
  useEffect(() => {
    load();
  }, [load]);

  async function pick(t: Target, c: Cand) {
    const r = await api(`/api/who/${aid}/guess`, { body: { profileId: t.profileId, chosenMemberId: c.id } });
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote(null);
    await load();
  }

  if (!data) return <p className="small">불러오는 중이에요…</p>;
  const g = data.guess;
  if (data.notJoin) return <div className="msg info">이 활동의 참여 대상으로 선택되지 않아서 맞히기에는 참여하지 않아요. 프로필 북에서 다른 회원의 소개를 읽어 보세요.</div>;
  if (g.status !== "open" && g.status !== "closed") {
    return <div className="msg info">{g.status === "before" ? `맞히기는 ${g.opensAt}부터 열려요.` : g.status === "unknown" ? "행사 날짜가 정해지면 맞히기가 열려요." : "이 활동에는 사전 맞히기가 없어요."}</div>;
  }
  const done = data.targets.filter((t) => t.myChoice).length;

  return (
    <>
      <div className="msg info">{g.status === "open" ? `${g.closesAt}까지 바꿀 수 있어요.` : "맞히기가 마감됐어요."} · {done}/{data.targets.length} 완료</div>
      {data.targets.length === 0 && <div className="msg info">아직 배포된 소개글이 없어요. 다른 회원이 작성하면 여기에 나타나요.</div>}
      <div className="pick">
        {data.targets.map((t) => {
          const chosen = data.candidates.find((c) => c.id === t.myChoice);
          const expanded = openId === t.profileId;
          return (
            <div key={t.profileId} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" className="opt" style={{ border: 0, padding: 0, minHeight: 0 }} aria-expanded={expanded} onClick={() => setOpenId(expanded ? "" : t.profileId)}>
                <span className="name">“{t.alias}”</span>
                <span className="small">{chosen ? `내 선택: ${chosen.name}` : "아직 고르지 않았어요"} · {expanded ? "접기" : "읽고 고르기"}</span>
              </button>
              {expanded && (
                <>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{t.introMd}</p>
                  <b>이 분은 누구일까요?</b>
                  <div className="pick" role="radiogroup" aria-label={`${t.alias} 추측`}>
                    {data.candidates.map((c) => (
                      <button key={c.id} type="button" role="radio" aria-checked={t.myChoice === c.id} className="opt" aria-pressed={t.myChoice === c.id} disabled={g.status !== "open"} onClick={() => pick(t, c)}>
                        <span className="name">{c.name}</span>
                        {c.trip && <span className="pill warn">{c.trip}</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
