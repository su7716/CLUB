"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Stage = {
  event: { id: string; name: string };
  activity: { id: string; name: string };
  missingSteps: string[];
  live: { active: boolean; stepLabel: string; unlocked: boolean; memberScreen: string };
  playedCount: number;
  remaining: number;
  selectable: { id: string; name: string }[];
  round: null | {
    id: string; state: "intro" | "results" | "reveal" | "voting" | "closed" | "answer"; orderNo: number;
    alias: string; introMd: string; nameRevealed: boolean; name: string;
    guessResults: { name: string; count: number }[]; guessTotal: number;
    statements: string[]; votes: { counts: number[]; voted: number; eligible: number };
    lieIndex: number; correctVoters: string[]; correctGuessers: string[];
  };
};
type Side = { top: { memberId: string; name: string; score: number }[]; topScore: number; tied: { id: string; name: string }[]; needsRoulette: boolean; lottery: null | { winnerId: string; winnerName: string; tiedIds: string[] } };
type Scores = { played: number; A: Side; B: Side };
type Action = "open" | "results" | "ready" | "name" | "vote" | "close" | "answer";

const STATE_LABEL: Record<string, string> = {
  intro: "소개 읽기", results: "사전 추측 결과", reveal: "“저예요” 대기", voting: "거짓 투표 중", closed: "투표 마감", answer: "정답 공개",
};

// 사회자 전체화면(프로젝터용). 2초마다 서버 상태를 읽고, 큰 버튼으로 진행한다.
export default function HostPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const [st, setSt] = useState<Stage | null>(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [pickId, setPickId] = useState("");
  const [busy, setBusy] = useState(false);
  const [board, setBoard] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api<Stage>(`/api/admin/events/${id}/activities/${aid}/stage`);
    if (r.ok) {
      setSt(r.data);
      setError("");
    } else if (r.status === 401 || r.status === 403) setDenied(true);
    else setError(r.error);
  }, [id, aid]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      if (document.visibilityState === "visible") await load();
      if (!stop) timer = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [load]);

  async function act(action: Action, targetMemberId?: string) {
    setBusy(true);
    setError("");
    const r = await api(`/api/admin/events/${id}/activities/${aid}/round`, { body: { action, targetMemberId } });
    setBusy(false);
    if (!r.ok) setError(r.error);
    await load();
  }

  function fullscreen() {
    const el = wrap.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else el.requestFullscreen?.().catch(() => setError("이 화면에서는 전체화면을 켤 수 없어요. 브라우저의 전체화면(F11)을 사용해 주세요."));
  }

  if (denied) {
    return (
      <div className="host" role="alert">
        <h1>관리자 확인이 필요해요</h1>
        <p className="sub">관리자로 로그인하고 관리자 비밀번호를 입력한 뒤 다시 열어 주세요.</p>
        <Link className="btn" href="/admin" style={{ width: "auto", alignSelf: "flex-start", textDecoration: "none" }}>관리자 화면으로</Link>
      </div>
    );
  }
  if (!st) return <div className="host">{error ? <p role="alert">{error}</p> : <p className="sub">불러오는 중이에요…</p>}</div>;

  const r = st.round;

  return (
    <div className="host" ref={wrap}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 28 }}>{st.activity.name}</h1>
        <span className="sub">{st.event.name} · {r ? `${r.orderNo}번째 · ${STATE_LABEL[r.state]}` : "시작 전"} · 진행 완료 {st.playedCount}명</span>
        <span style={{ flex: 1 }} />
        <button className="mini" type="button" onClick={() => setBoard(!board)}>{board ? "진행 화면" : "점수판"}</button>
        <button className="mini" type="button" onClick={fullscreen}>전체화면 ⛶</button>
        <Link className="mini" href={`/admin/events/${id}`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>관리자로 돌아가기</Link>
      </header>

      {error && <div className="msg bad" role="alert">{error}</div>}
      {st.missingSteps.length > 0 && (
        <div className="msg bad" role="alert">이 활동의 템플릿에 필요한 단계가 없어요: {st.missingSteps.join(", ")}. 활동 설정에서 단계를 추가해 주세요.</div>
      )}

      {board ? (
        <Board id={id} aid={aid} setError={setError} />
      ) : (
        <>
          <div className="stage">
            {/* 왼쪽: 소개, 문장 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              {!r && (
                <div className="panel">
                  <h2>다음 소개를 열어 주세요</h2>
                  <p className="sub" style={{ margin: 0 }}>진행할 수 있는 사람 {st.remaining}명 남았어요. 소개와 2진실 1거짓을 승인한 회원만 나와요.</p>
                </div>
              )}
              {r && (r.state === "intro" || r.state === "results" || r.state === "reveal") && (
                <div className="panel">
                  <span className="sub">이 분은 누구일까요?</span>
                  <div className="alias">“{r.alias}”</div>
                  <div className="intro">{r.introMd}</div>
                </div>
              )}
              {r && (r.state === "voting" || r.state === "closed" || r.state === "answer") && (
                <>
                  <h2 style={{ color: "#e5c9a3", fontSize: 34 }}>두 개의 진실과 한 개의 거짓</h2>
                  <p style={{ margin: 0 }}>“{r.alias}” 님의 이야기 중 거짓이라고 생각하는 번호를 내 휴대폰에서 골라 주세요.</p>
                  {r.statements.map((t, i) => (
                    <div key={i} className={`stmt ${r.state === "answer" ? (i === r.lieIndex ? "lie" : "truth") : ""}`}>
                      <span className="no">{i + 1}</span>
                      <span style={{ flex: 1 }}>{t}</span>
                      {r.state === "answer" && <b>{i === r.lieIndex ? "거짓!" : "진실"}</b>}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* 오른쪽: 결과, 이름, 투표 현황 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              {r && r.state !== "intro" && (
                <div className="panel">
                  <h3>사전 추측 결과 ({r.guessTotal}명)</h3>
                  {r.guessResults.length === 0 && <span className="sub">추측한 분이 없어요.</span>}
                  {r.guessResults.slice(0, 6).map((g) => (
                    <div key={g.name}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span>{g.name}</span><span className="num">{g.count}표</span></div>
                      <div className="bar"><i style={{ width: `${r.guessTotal ? (g.count / r.guessTotal) * 100 : 0}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {r && (
                <div className="panel">
                  <h3>정답 이름</h3>
                  <div className={`namebox ${r.nameRevealed ? "on" : ""}`} aria-live="polite">{r.nameRevealed ? r.name : "?"}</div>
                  {r.state === "reveal" && !r.nameRevealed && <span className="sub">당사자 휴대폰에 “저예요” 버튼이 떠 있어요. 사회자가 대신 공개할 수도 있어요.</span>}
                  {r.state === "answer" && <span className="sub">사전 추측으로 맞힌 분 {r.correctGuessers.length}명{r.correctGuessers.length ? `: ${r.correctGuessers.join(", ")}` : ""}</span>}
                </div>
              )}
              {r && (r.state === "voting" || r.state === "closed" || r.state === "answer") && (
                <div className="panel">
                  <h3>거짓 투표 현황 <span className="num">{r.votes.voted} / {r.votes.eligible}</span></h3>
                  {r.votes.counts.map((n, i) => (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span>{i + 1}번</span><span className="num">{n}표</span></div>
                      <div className="bar"><i style={{ width: `${r.votes.voted ? (n / r.votes.voted) * 100 : 0}%`, background: r.state === "answer" && i === r.lieIndex ? "#ff4b4b" : undefined }} /></div>
                    </div>
                  ))}
                  {r.state === "voting" && <span className="sub">아직 투표하지 않은 분 {r.votes.eligible - r.votes.voted}명</span>}
                  {r.state === "answer" && <span className="sub">거짓을 맞힌 분 {r.correctVoters.length}명{r.correctVoters.length ? `: ${r.correctVoters.join(", ")}` : ""}</span>}
                </div>
              )}
            </div>
          </div>

          {/* 사회자 버튼 */}
          <div className="controls" role="group" aria-label="사회자 버튼">
            {!r || r.state === "answer" ? (
              <>
                <button className="btn" type="button" disabled={busy || st.remaining === 0} onClick={() => act("open")}>{r ? "다음 사람 ›" : "소개 열기 (무작위)"}</button>
                {st.selectable.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flex: "1 1 280px" }}>
                    <select className="field" aria-label="순서 지정" value={pickId} onChange={(e) => setPickId(e.target.value)} style={{ minHeight: 64, fontSize: 20 }}>
                      <option value="">순서 지정…</option>
                      {st.selectable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <button className="btn white" type="button" disabled={busy || !pickId} style={{ flex: "0 0 auto", minWidth: 120 }} onClick={() => act("open", pickId)}>이 사람</button>
                  </div>
                )}
              </>
            ) : null}
            {r?.state === "intro" && <button className="btn" type="button" disabled={busy} onClick={() => act("results")}>추측 결과 보기</button>}
            {r?.state === "results" && (
              <>
                <button className="btn" type="button" disabled={busy} onClick={() => act("ready")}>“저예요” 열기</button>
                <button className="btn white" type="button" disabled={busy || r.nameRevealed} onClick={() => act("name")}>이름 공개</button>
              </>
            )}
            {r?.state === "reveal" && (
              <>
                <button className="btn white" type="button" disabled={busy || r.nameRevealed} onClick={() => act("name")}>이름 공개</button>
                <button className="btn blue" type="button" disabled={busy} onClick={() => act("vote")}>투표</button>
              </>
            )}
            {r?.state === "voting" && <button className="btn red" type="button" disabled={busy} onClick={() => act("close")}>투표 마감</button>}
            {r?.state === "closed" && <button className="btn" type="button" disabled={busy} onClick={() => act("answer")}>정답 공개</button>}
            {r?.state === "voting" && <button className="btn white" type="button" disabled={busy} onClick={() => act("answer")}>마감하고 정답 공개</button>}
          </div>
        </>
      )}
    </div>
  );
}

/* ───── 점수판과 동점자 룰렛 ───── */
function Board({ id, aid, setError }: { id: string; aid: string; setError: (e: string) => void }) {
  const [sc, setSc] = useState<Scores | null>(null);
  const [spin, setSpin] = useState<{ cat: "A" | "B"; shown: string } | null>(null);

  const load = useCallback(async () => {
    const r = await api<Scores>(`/api/admin/events/${id}/activities/${aid}/scores`);
    if (r.ok) setSc(r.data);
    else setError(r.error);
  }, [id, aid, setError]);
  useEffect(() => {
    load();
  }, [load]);

  async function roulette(cat: "A" | "B", redo = false) {
    const r = await api<{ tied: { id: string; name: string }[]; winnerName: string }>(`/api/admin/events/${id}/activities/${aid}/scores`, { body: { category: cat, redo } });
    if (!r.ok) return setError(r.error);
    const names = r.data.tied.map((x) => x.name); // 동점자만 룰렛에 나온다
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      await load();
      return;
    }
    let i = 0;
    const steps = 28;
    const run = (n: number) => {
      if (n >= steps) {
        setSpin(null);
        load();
        return;
      }
      setSpin({ cat, shown: n === steps - 1 ? r.data.winnerName : names[i++ % names.length] });
      setTimeout(() => run(n + 1), 80 + n * 14); // 점점 느려진다
    };
    run(0);
  }

  if (!sc) return <p className="sub">불러오는 중이에요…</p>;

  const side = (cat: "A" | "B", title: string, s: Side) => (
    <div className="panel">
      <h2>{title}</h2>
      {s.top.map((x, i) => (
        <div key={x.memberId} style={{ display: "flex", justifyContent: "space-between", color: x.score === s.topScore && s.topScore > 0 ? "#ffc800" : undefined }}>
          <span>{i + 1}. {x.name}</span><span className="num">{x.score}점</span>
        </div>
      ))}
      {s.topScore === 0 && <span className="sub">아직 점수가 없어요.</span>}
      {s.needsRoulette && (
        <>
          <span className="sub">동점자 {s.tied.length}명: {s.tied.map((x) => x.name).join(", ")}</span>
          <div className={`roulette ${spin?.cat === cat ? "spin" : ""}`} aria-live="polite">
            {spin?.cat === cat ? spin.shown : s.lottery ? `🎉 ${s.lottery.winnerName}` : "룰렛을 돌려 주세요"}
          </div>
          {!s.lottery && <button className="btn" type="button" disabled={spin !== null} onClick={() => roulette(cat)}>동점자 룰렛 돌리기</button>}
          {s.lottery && <button className="btn white" type="button" disabled={spin !== null} onClick={() => roulette(cat, true)}>다시 돌리기</button>}
        </>
      )}
      {!s.needsRoulette && s.topScore > 0 && <div className="roulette" style={{ borderColor: "#58cc02", color: "#7fe04a" }}>🏆 {s.top[0].name}</div>}
    </div>
  );

  return (
    <>
      <p className="sub" style={{ margin: 0 }}>정답이 공개된 {sc.played}명 기준이에요. 각 부문 1위에게 선물해요. 동점이면 동점자만으로 룰렛을 돌려요.</p>
      <div className="stage">
        {side("A", "A. 누구인지 가장 많이 맞힌 사람", sc.A)}
        {side("B", "B. 거짓을 가장 많이 맞힌 사람", sc.B)}
      </div>
    </>
  );
}
