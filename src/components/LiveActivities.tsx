"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";

type Worry = {
  canJoin: boolean; body: string; category: string; orderNo: number; paused: boolean; remainingMs: number;
  timeUp: boolean; nameRevealed: boolean; displayName: string; isMine: boolean; canSelfReveal: boolean;
  tips: string[]; serverNow: number;
};
type Round = {
  id: string;
  canJoin: boolean;
  state: "intro" | "results" | "reveal" | "voting" | "closed" | "answer";
  alias: string;
  isTarget: boolean;
  screen: string;
  nameRevealed: boolean;
  name: string;
  statements: string[];
  voted: boolean;
  myVote: number;
  lieIndex: number;
  correct: boolean | null;
};
type Live = {
  id: string;
  name: string;
  description: string;
  pre: { enabled: boolean; status: string; opensAt: string; closesAt: string };
  guess: { enabled: boolean; status: string; opensAt: string; closesAt: string };
  kind: string;
  participants: string;
  startsAt: string;
  endsAt: string;
  canJoin: boolean;
  live: { active: boolean; stepLabel: string; unlocked: boolean; memberScreen: string };
  round: Round | null;
  worry: Worry | null;
};

const SCREEN_NOTE: Record<string, string> = {
  write: "작성 화면이 열렸어요",
  vote: "투표 화면이 열렸어요",
  iam_button: "“저예요” 버튼이 열렸어요",
  pick_person: "사람을 고르는 화면이 열렸어요",
  view: "결과를 볼 수 있어요",
};

function preBadge(p: Live["pre"]): { tone: string; text: string } {
  if (!p.enabled) return { tone: "warn", text: "현장에서 진행" };
  if (p.status === "open") return { tone: "ok", text: `사전 작성 중 · ${p.closesAt}까지` };
  if (p.status === "before") return { tone: "gray", text: `사전 작성 ${p.opensAt}부터` };
  if (p.status === "closed") return { tone: "gray", text: "사전 작성 마감" };
  return { tone: "gray", text: "사전 작성 · 날짜 미정" };
}

// 활동 카드. 2초마다 서버 상태를 확인해서 사회자가 버튼을 누르면 회원 화면이 바로 켜진다.
export function LiveActivities({ eventId }: { eventId: string }) {
  const [list, setList] = useState<Live[] | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ activities: Live[] }>(`/api/events/${eventId}/live`);
    if (r.ok) {
      setList(r.data.activities);
      setOffline(false);
    } else setOffline(true);
  }, [eventId]);

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

  if (!list || list.length === 0) return null;

  return (
    <section aria-label="활동" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: "400 20px var(--display)" }}>활동</b>
      {offline && <div className="msg info" role="status">연결이 불안정해요. 다시 연결하는 중이에요…</div>}
      {list.map((a) => {
        const b = preBadge(a.pre);
        return (
          <div key={a.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <b style={{ font: "400 19px var(--display)" }}>{a.name}</b>
              <span className={`pill ${b.tone}`}>{b.text}</span>
            </div>
            {a.description && <span className="small">{a.description}</span>}
            {a.startsAt && (
              <span className="small">
                활동 시간: {a.startsAt.slice(5, 10).replace("-", "/")} {a.startsAt.slice(11, 16)}{a.endsAt ? ` ~ ${a.endsAt.slice(11, 16)}` : ""}
              </span>
            )}
            {a.participants === "selected" && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                <span className="pill warn">관리자가 선택한 회원만 참여</span>
                {!a.canJoin && <span className="small">이 활동에는 참여 대상으로 선택되지 않았어요. 관리자에게 문의해 주세요.</span>}
              </div>
            )}
            {a.kind === "worry" && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {a.pre.status === "open" ? (
                  <Link href={`/events/${eventId}/worry/${a.id}`} className="btn" style={{ width: "auto", minHeight: 46, fontSize: 17, textDecoration: "none" }}>고민 작성하기</Link>
                ) : (
                  <Link href={`/events/${eventId}/worry/${a.id}`} className="btn white" style={{ width: "auto", minHeight: 46, fontSize: 17, textDecoration: "none" }}>내 고민 보기</Link>
                )}
              </div>
            )}
            {a.kind === "capsule" && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                <Link href={`/events/${eventId}/capsule/${a.id}`} className={`btn ${a.live.unlocked && a.live.memberScreen === "write" && a.canJoin ? "" : "white"}`} style={{ width: "auto", minHeight: 46, fontSize: 17, textDecoration: "none" }}>
                  {a.live.unlocked && a.live.memberScreen === "write" && a.canJoin ? "타임캡슐 작성하기" : "내 타임캡슐 보기"}
                </Link>
              </div>
            )}
            {a.kind === "who" && (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {a.pre.status === "open" || a.guess.status === "open" || a.pre.status === "closed" ? (
                  <Link href={`/events/${eventId}/who/${a.id}`} className="btn" style={{ width: "auto", minHeight: 46, fontSize: 17, textDecoration: "none" }}>
                    {a.pre.status === "open" ? "소개 작성하기" : a.guess.status === "open" ? "누구일까요? 맞히기" : "내 소개 보기"}
                  </Link>
                ) : (
                  <span className="small">작성 기간이 되면 여기에서 시작할 수 있어요.</span>
                )}
                {a.pre.status === "open" && a.guess.status === "open" && (
                  <Link href={`/events/${eventId}/who/${a.id}`} className="btn white" style={{ width: "auto", minHeight: 46, fontSize: 17, textDecoration: "none" }}>누구일까요?</Link>
                )}
              </div>
            )}
            {a.round ? (
              <RoundPanel aid={a.id} round={a.round} reload={load} />
            ) : a.worry ? (
              <WorryPanel aid={a.id} w={a.worry} reload={load} />
            ) : (
              a.live.active && (
                <div className={`msg ${a.live.unlocked ? "" : "info"}`} role="status" style={a.live.unlocked ? { background: "var(--green-bg)", color: "var(--green-t)" } : undefined}>
                  진행 중: {a.live.stepLabel}
                  {a.live.unlocked ? ` · ${SCREEN_NOTE[a.live.memberScreen] ?? "화면이 열렸어요"}` : " · 사회자가 열면 시작돼요"}
                </div>
              )
            )}
          </div>
        );
      })}
    </section>
  );
}

/* ───── 나의 고민은?: 지금 뽑힌 고민 (회원 휴대폰) ───── */
function fmt(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function WorryPanel({ aid, w, reload }: { aid: string; w: Worry; reload: () => Promise<void> }) {
  const [now, setNow] = useState(() => Date.now());
  const [recvAt, setRecvAt] = useState(() => Date.now());
  const [err, setErr] = useState("");
  // 서버가 계산한 남은 시간을 받은 시점을 기억해 두고, 그 뒤로 흐른 시간만큼 화면에서 줄여 간다.
  // (휴대폰 시계가 서버와 달라도 영향이 없다.)
  useEffect(() => {
    setRecvAt(Date.now());
  }, [w.serverNow]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = w.paused || w.timeUp ? 0 : Math.max(0, now - recvAt);
  const remaining = Math.max(0, w.remainingMs - elapsed);

  async function selfReveal() {
    setErr("");
    const r = await api(`/api/worry/${aid}/reveal-self`, { body: {} });
    if (!r.ok) setErr(r.error);
    await reload();
  }

  return (
    <div style={{ borderTop: "2px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className="pill blue">{w.orderNo}번째 고민 · {w.category}</span>
        {w.isMine && <span className="pill warn">내 고민이에요</span>}
      </div>
      {!w.canJoin && <div className="msg info" role="status">이 활동의 참여 대상으로 선택되지 않았어요. 진행 모습은 큰 화면에서 볼 수 있어요.</div>}
      <p style={{ margin: 0, fontWeight: 700, lineHeight: 1.7 }}>{w.body}</p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <b className="num" style={{ font: "400 32px var(--display)" }} aria-label="남은 시간">{w.timeUp ? "00:00" : fmt(remaining)}</b>
        <span className="small">{w.timeUp ? "대화 시간이 끝났어요" : w.paused ? "일시정지 중" : "대화 중"}</span>
      </div>
      {w.nameRevealed && <div className="msg info" role="status">작성자: <b>{w.displayName}</b></div>}
      {w.tips.length > 0 && (
        <div className="card"><b>대화를 시작하는 관점</b><ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>{w.tips.map((t, i) => <li key={i}>{t}</li>)}</ol></div>
      )}
      {err && <div className="msg bad" role="alert">{err}</div>}
      {w.canSelfReveal && <button className="btn white" type="button" onClick={selfReveal}>제가 쓴 고민이에요 (이름 밝히기)</button>}
    </div>
  );
}

/* ───── 현장 진행: 회원 휴대폰 화면 (사회자 버튼에 따라 바뀐다) ───── */
function RoundPanel({ aid, round, reload }: { aid: string; round: Round; reload: () => Promise<void> }) {
  const [sel, setSel] = useState(-1);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 라운드가 바뀌면 선택을 비운다
  useEffect(() => {
    setSel(-1);
    setErr("");
  }, [round.id]);

  async function post(path: string, body: unknown) {
    setBusy(true);
    setErr("");
    const r = await api(path, { body });
    setBusy(false);
    if (!r.ok) setErr(r.error);
    await reload();
  }

  const head = (
    <div className="row" style={{ flexWrap: "wrap" }}>
      <span className="pill blue">지금 소개</span>
      <b style={{ font: "400 20px var(--display)" }}>“{round.alias}”</b>
      {round.nameRevealed && round.name && <span className="pill ok">{round.name} 님</span>}
    </div>
  );

  let body: React.ReactNode;
  if (!round.canJoin) {
    body = <div className="msg info" role="status">이 활동은 관리자가 선택한 회원만 참여할 수 있어요. 진행 모습은 큰 화면에서 볼 수 있어요.</div>;
  } else if (round.screen === "iam_button" && round.isTarget && round.state === "reveal") {
    body = (
      <>
        <div className="msg info">내 소개예요! 준비가 되면 아래 버튼을 눌러 주세요.</div>
        <button className="btn" type="button" disabled={busy || round.nameRevealed} onClick={() => post(`/api/who/${aid}/iam`, {})}>
          {round.nameRevealed ? "이름이 공개됐어요 ✓" : "저예요"}
        </button>
      </>
    );
  } else if (round.screen === "vote" && round.state === "voting") {
    body = round.isTarget ? (
      <div className="msg info">내 차례예요. 다른 분들이 투표하고 있어요. 투표는 하지 않아요.</div>
    ) : (
      <>
        <b>거짓은 어느 것일까요?</b>
        <span className="small">두 개는 진실, 한 개는 거짓이에요. 한 번만 투표할 수 있어요.</span>
        <div className="pick">
          {round.statements.map((t, i) => (
            <button key={i} type="button" className="opt" aria-pressed={(round.voted ? round.myVote : sel) === i} disabled={round.voted || busy} onClick={() => setSel(i)}>
              <span className="name">{i + 1}. {t}</span>
            </button>
          ))}
        </div>
        {round.voted ? (
          <div className="msg info" role="status">{round.myVote + 1}번에 투표했어요. 결과를 기다려 주세요.</div>
        ) : (
          <button className="btn" type="button" disabled={busy || sel < 0} onClick={() => post(`/api/who/${aid}/vote`, { chosenIndex: sel })}>확인</button>
        )}
      </>
    );
  } else if (round.state === "closed") {
    body = <div className="msg info" role="status">투표가 마감됐어요. 정답 공개를 기다려 주세요.{round.voted ? ` (내 선택: ${round.myVote + 1}번)` : ""}</div>;
  } else if (round.state === "answer" && round.lieIndex >= 0) {
    body = (
      <>
        <div className="pick">
          {round.statements.map((t, i) => (
            <div key={i} className="card" style={i === round.lieIndex ? { borderColor: "var(--green)", background: "var(--green-bg)" } : round.myVote === i ? { borderColor: "var(--red)" } : undefined}>
              <b>{i + 1}. {t}</b>
              <div className="small">{i === round.lieIndex ? "거짓이었어요!" : "진실이에요"}{round.myVote === i ? " · 내 선택" : ""}</div>
            </div>
          ))}
        </div>
        {round.isTarget ? null : round.correct === true ? (
          <div className="msg info" style={{ background: "var(--green-bg)", color: "var(--green-t)" }} role="status">맞혔어요! 🎉</div>
        ) : round.voted ? (
          <div className="msg info" role="status">아쉬워요. 다음에는 맞힐 수 있어요.</div>
        ) : (
          <div className="msg info" role="status">투표하지 않았어요.</div>
        )}
      </>
    );
  } else {
    body = <div className="msg info" role="status">사회자가 진행하고 있어요. 화면을 켜 두고 기다려 주세요.</div>;
  }

  return (
    <div style={{ borderTop: "2px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      {head}
      {err && <div className="msg bad" role="alert">{err}</div>}
      {body}
    </div>
  );
}
