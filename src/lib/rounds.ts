import { randomInt } from "node:crypto";
import { isWhoAmI, liveView, readConfig, type LiveView } from "./activities";
import { parseJson } from "./api";
import { canJoin, joinSet, onsiteGate } from "./participants";
import { getStore } from "./store";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";

// 한 사람씩 진행하는 라운드의 순서. 각 단계는 템플릿의 현장 단계(intro/reveal/vote/result)와 연결된다.
//  intro   소개 열림(이름 비공개)      → 템플릿 'intro' 단계
//  results 사전 추측 결과 공개
//  reveal  "저예요" 버튼 열림           → 템플릿 'reveal' 단계 (당사자 휴대폰에 버튼)
//  voting  거짓 투표 중                 → 템플릿 'vote' 단계 (회원 휴대폰에 투표 화면)
//  closed  투표 마감
//  answer  정답 공개                    → 템플릿 'result' 단계
export type RoundState = "intro" | "results" | "reveal" | "voting" | "closed" | "answer";
export const REQUIRED_STEPS = ["intro", "reveal", "vote", "result"] as const;

export type Action = "open" | "results" | "ready" | "name" | "vote" | "close" | "answer";

const FROM: Record<Exclude<Action, "open" | "name">, RoundState[]> = {
  results: ["intro"],
  ready: ["intro", "results"],
  vote: ["intro", "results", "reveal"],
  close: ["voting"],
  answer: ["voting", "closed"],
};

export type StageCtx = { act: Row; ev: Row; cfg: TemplateConfig };

// 행사와 활동 확인. '내가 누굴까요?' 방식의 활동이어야 한다.
export async function loadStage(eventId: string, aid: string): Promise<StageCtx | string> {
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === eventId);
  const cfg = act ? readConfig(act.config) : null;
  const ev = (await s.list("Events")).find((e) => e.id === eventId);
  if (!act || !cfg || !ev) return "활동을 찾을 수 없어요.";
  if (!isWhoAmI(cfg)) return "소개 작성이 있는 활동이 아니에요.";
  return { act, ev, cfg };
}

export function missingSteps(cfg: TemplateConfig): string[] {
  return REQUIRED_STEPS.filter((k) => !cfg.onsite.steps.some((s) => s.key === k));
}

export async function liveRow(aid: string): Promise<Row | undefined> {
  return (await (await getStore()).list("LiveState")).find((l) => l.eventActivityId === aid);
}

export async function setLive(aid: string, step: string | null, unlocked: boolean, payload?: Record<string, unknown>): Promise<void> {
  const s = await getStore();
  const cur = await liveRow(aid);
  const patch: Record<string, string> = { memberUnlocked: String(unlocked), updatedAt: new Date().toISOString() };
  if (step !== null) patch.step = step;
  if (payload) patch.payload = JSON.stringify(payload);
  if (cur) await s.update("LiveState", cur.id, patch);
  else await s.insert("LiveState", { eventActivityId: aid, step: step ?? "", ...patch });
}

export async function rounds(aid: string): Promise<Row[]> {
  return (await (await getStore()).list("Rounds"))
    .filter((r) => r.eventActivityId === aid)
    .sort((a, b) => Number(a.orderNo) - Number(b.orderNo));
}

export async function currentRound(aid: string): Promise<Row | undefined> {
  const r = await rounds(aid);
  return r[r.length - 1];
}

// 진행할 수 있는 사람: 소개와 2진실 1거짓이 모두 승인된 회원 중 아직 진행하지 않은 사람.
// join 이 있으면(현장 참석자만 참여하는 활동) 그 안에 있는 사람만 나온다.
export async function eligibleTargets(aid: string, join: Set<string> | null = null): Promise<Row[]> {
  const s = await getStore();
  const [members, profiles, tls, played] = await Promise.all([
    s.list("Members"), s.list("Profiles"), s.list("TruthLies"), rounds(aid),
  ]);
  const done = new Set(played.map((r) => r.targetMemberId));
  return members.filter((m) => {
    const p = profiles.find((x) => x.memberId === m.id);
    const t = tls.find((x) => x.memberId === m.id && x.eventActivityId === aid);
    return p?.introStatus === "approved" && t?.status === "approved" && !done.has(m.id) && (!join || join.has(m.id));
  });
}

export type ActionResult = { ok: true } | { ok: false; error: string; status?: number };

// 사회자 버튼. 규칙(순서)을 서버가 지키고, 회원 화면은 LiveState 로 켜고 끈다.
export async function doAction(ctx: StageCtx, action: Action, targetMemberId?: string): Promise<ActionResult> {
  const s = await getStore();
  const aid = ctx.act.id;
  const miss = missingSteps(ctx.cfg);
  if (miss.length) return { ok: false, error: `이 활동의 템플릿에 필요한 단계가 없어요: ${miss.join(", ")}` };
  // 관리자 선택 회원 활동은 활동 전에 출석 체크를 완료해야 시작할 수 있다.
  if (action === "open") {
    const gate = await onsiteGate(ctx.cfg, ctx.act);
    if (gate) return { ok: false, error: gate, status: 409 };
  }

  const cur = await currentRound(aid);
  const now = new Date().toISOString();

  if (action === "open") {
    if (cur && cur.state !== "answer") return { ok: false, error: "진행 중인 사람이 있어요. 정답 공개까지 마친 뒤 다음 사람으로 넘어가요.", status: 409 };
    const pool = await eligibleTargets(aid, await joinSet(ctx.cfg, ctx.act, ctx.ev));
    if (pool.length === 0) {
      return { ok: false, error: ctx.cfg.participants === "selected" ? "진행할 사람이 더 없어요. 관리자가 선택한 회원 중 소개와 2진실 1거짓을 승인한 회원이 필요해요." : "진행할 사람이 더 없어요. 소개와 2진실 1거짓을 승인한 회원이 필요해요.", status: 409 };
    }
    let target = pool[randomInt(pool.length)];
    if (targetMemberId) {
      const pick = pool.find((m) => m.id === targetMemberId);
      if (!pick) return { ok: false, error: "이 사람은 지금 진행할 수 없어요(승인 전이거나 이미 진행했어요)." };
      target = pick;
    }
    const orderNo = String((cur ? Number(cur.orderNo) : 0) + 1);
    await s.insert("Rounds", { eventActivityId: aid, targetMemberId: target.id, state: "intro", orderNo, nameRevealed: "false", updatedAt: now });
    await setLive(aid, "intro", true);
    return { ok: true };
  }

  if (!cur) return { ok: false, error: "먼저 소개를 열어 주세요.", status: 409 };
  const state = cur.state as RoundState;

  if (action === "name") {
    if (state === "intro") return { ok: false, error: "추측 결과를 보여 준 뒤에 이름을 공개할 수 있어요.", status: 409 };
    await s.update("Rounds", cur.id, { nameRevealed: "true", updatedAt: now });
    return { ok: true };
  }

  if (!FROM[action].includes(state)) return { ok: false, error: "지금 단계에서는 누를 수 없는 버튼이에요.", status: 409 };

  if (action === "results") {
    await s.update("Rounds", cur.id, { state: "results", updatedAt: now });
  } else if (action === "ready") {
    await s.update("Rounds", cur.id, { state: "reveal", updatedAt: now });
    await setLive(aid, "reveal", true);
  } else if (action === "vote") {
    await s.update("Rounds", cur.id, { state: "voting", updatedAt: now });
    await setLive(aid, "vote", true);
  } else if (action === "close") {
    await s.update("Rounds", cur.id, { state: "closed", updatedAt: now });
    await setLive(aid, null, false);
  } else if (action === "answer") {
    await s.update("Rounds", cur.id, { state: "answer", nameRevealed: "true", updatedAt: now });
    await setLive(aid, "result", true);
  }
  return { ok: true };
}

/* ───── 회원에게 보이는 라운드 정보 ───── */

export type MemberRound = {
  id: string;
  canJoin: boolean; // 현장 참여 대상인지(참석자만 참여하는 활동에서 참석 신청을 안 했으면 false)
  state: RoundState;
  alias: string;
  isTarget: boolean;
  screen: LiveView["memberScreen"];
  nameRevealed: boolean;
  name: string;
  statements: string[];
  voted: boolean;
  myVote: number;
  lieIndex: number; // 정답 공개 전에는 -1
  correct: boolean | null;
};

export async function memberRound(act: Row, ev: Row, memberId: string, cfg: TemplateConfig): Promise<MemberRound | null> {
  const aid = act.id;
  const s = await getStore();
  const cur = await currentRound(aid);
  if (!cur) return null;
  const [profiles, tls, votes, members, live] = await Promise.all([
    s.list("Profiles"), s.list("TruthLies"), s.list("Votes"), s.list("Members"), liveRow(aid),
  ]);
  const view = liveView(cfg, live);
  const target = cur.targetMemberId;
  const state = cur.state as RoundState;
  const tl = tls.find((t) => t.memberId === target && t.eventActivityId === aid);
  const mine = votes.find((v) => v.roundId === cur.id && v.voterId === memberId);
  const showStatements = state === "voting" || state === "closed" || state === "answer";
  const answered = state === "answer";
  const lieIndex = tl?.lieIndex ? Number(tl.lieIndex) : 0;
  const named = cur.nameRevealed === "true";
  return {
    id: cur.id,
    canJoin: await canJoin(cfg, act, ev, memberId),
    state,
    alias: profiles.find((p) => p.memberId === target)?.alias ?? "",
    isTarget: target === memberId,
    screen: view.memberScreen,
    nameRevealed: named,
    name: named ? members.find((m) => m.id === target)?.name ?? "" : "",
    statements: showStatements ? parseJson<string[]>(tl?.statements, []) : [],
    voted: Boolean(mine),
    myVote: mine ? Number(mine.chosenIndex) : -1,
    lieIndex: answered ? lieIndex : -1,
    correct: answered && mine ? Number(mine.chosenIndex) === lieIndex : null,
  };
}

/* ───── 점수 ───── */

export type Score = { memberId: string; name: string; score: number };

// A) 누구인지 가장 많이 맞힌 사람(사전 추측), B) 거짓을 가장 많이 맞힌 사람(현장 투표).
// 정답이 공개된 라운드만 센다.
export async function computeScores(aid: string): Promise<{ A: Score[]; B: Score[]; played: number }> {
  const s = await getStore();
  const [rs, guesses, votes, tls, members] = await Promise.all([
    rounds(aid), s.list("Guesses"), s.list("Votes"), s.list("TruthLies"), s.list("Members"),
  ]);
  const answered = rs.filter((r) => r.state === "answer");
  const a = new Map<string, number>();
  const b = new Map<string, number>();
  for (const r of answered) {
    for (const g of guesses) {
      if (g.eventActivityId === aid && g.targetMemberId === r.targetMemberId && g.chosenMemberId === r.targetMemberId) {
        a.set(g.guesserId, (a.get(g.guesserId) ?? 0) + 1);
      }
    }
    const tl = tls.find((t) => t.memberId === r.targetMemberId && t.eventActivityId === aid);
    const lie = tl?.lieIndex ? Number(tl.lieIndex) : 0;
    for (const v of votes) {
      if (v.roundId === r.id && Number(v.chosenIndex) === lie) b.set(v.voterId, (b.get(v.voterId) ?? 0) + 1);
    }
  }
  const list = (m: Map<string, number>): Score[] =>
    members
      .filter((x) => x.kind !== "회원대기")
      .map((x) => ({ memberId: x.id, name: x.name, score: m.get(x.id) ?? 0 }))
      .sort((p, q) => q.score - p.score || p.name.localeCompare(q.name, "ko"));
  return { A: list(a), B: list(b), played: answered.length };
}

// 1위 점수와 동점자 목록(점수가 0이면 아무도 없음)
export function topOf(list: Score[]): { score: number; tied: Score[] } {
  const score = list[0]?.score ?? 0;
  return { score, tied: score > 0 ? list.filter((x) => x.score === score) : [] };
}
