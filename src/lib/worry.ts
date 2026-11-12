import { randomInt } from "node:crypto";
import { z } from "zod";
import { activityKind, liveView, readConfig } from "./activities";
import { ask, isAiEnabled } from "./ai";
import { guidelinesFor } from "./ai-guides";
import { parseJson } from "./api";
import { canJoin, joinSet, onsiteGate } from "./participants";
import { liveRow, setLive } from "./rounds";
import { getStore, getSetting } from "./store";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";

export const CATEGORIES = ["경영", "인재", "AI 도입", "가족·건강", "기타"] as const;

// 고민 작성 입력. 익명/실명 여부는 작성할 때 미리 정한다.
export const worryBody = z.object({
  body: z.string().trim().min(2).max(500),
  category: z.enum(CATEGORIES),
  anonymous: z.boolean(),
});
export const MAX_WORRIES = 3; // 회원 1명이 적을 수 있는 고민 수
export const WORRY_STEPS = ["draw", "talk", "reveal"] as const;

// 진행 상태는 LiveState.payload.worry 에 저장한다(서버 메모리에 두지 않으므로 중단했다가 이어서 진행할 수 있다).
export type WorryPayload = { currentId: string; endsAt: string; remainingMs: number | null; minutes: number; tips: string[] };
type Payload = { worry?: WorryPayload } & Record<string, unknown>;

export type WorryCtx = { act: Row; ev: Row; cfg: TemplateConfig };

// eventId 가 있으면 관리자용(공개 여부 무관), 없으면 회원용(공개된 행사만)
export async function loadWorry(aid: string, eventId?: string): Promise<WorryCtx | string> {
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && (!eventId || a.eventId === eventId));
  const cfg = act ? readConfig(act.config) : null;
  const ev = act ? (await s.list("Events")).find((e) => e.id === act.eventId && (eventId ? true : e.published === "true")) : undefined;
  if (!act || !cfg || !ev) return "활동을 찾을 수 없어요.";
  if (activityKind(cfg) !== "worry") return "고민을 적는 활동이 아니에요.";
  return { act, ev, cfg };
}

export function missingWorrySteps(cfg: TemplateConfig): string[] {
  return WORRY_STEPS.filter((k) => !cfg.onsite.steps.some((s) => s.key === k));
}

export async function readPayload(aid: string): Promise<Payload> {
  return parseJson<Payload>((await liveRow(aid))?.payload, {});
}

export function timerView(p: WorryPayload | undefined, now = Date.now()) {
  if (!p?.currentId) return null;
  const paused = p.remainingMs !== null;
  const remainingMs = paused ? (p.remainingMs as number) : Math.max(0, Date.parse(p.endsAt) - now);
  return { paused, remainingMs, timeUp: !paused && remainingMs <= 0 };
}

export const worryRows = async (aid: string): Promise<Row[]> =>
  (await (await getStore()).list("Worries")).filter((w) => w.eventActivityId === aid);

// 화면에 보이는 작성자 표시: 이름 오픈 전에는 비어 있고, 오픈하면 실명 작성자는 이름, 익명은 "익명".
// 익명 작성자가 직접 밝히면(authorShown) 이름이 나온다.
export async function displayName(w: Row): Promise<string> {
  if (w.nameRevealed !== "true") return "";
  if (w.anonymous === "true" && w.authorShown !== "true") return "익명";
  return (await (await getStore()).list("Members")).find((m) => m.id === w.memberId)?.name ?? "";
}

export type WorryAction = "draw" | "pause" | "resume" | "extend" | "skip" | "reveal" | "tips";
type R = { ok: true } | { ok: false; error: string; status?: number };

export async function doWorryAction(ctx: WorryCtx, action: WorryAction, p: { category?: string; minutes?: number }): Promise<R> {
  const s = await getStore();
  const aid = ctx.act.id;
  const miss = missingWorrySteps(ctx.cfg);
  if (miss.length) return { ok: false, error: `이 활동의 템플릿에 필요한 단계가 없어요: ${miss.join(", ")}` };

  const payload = await readPayload(aid);
  const cur = payload.worry;
  const rows = await worryRows(aid);
  const current = cur?.currentId ? rows.find((w) => w.id === cur.currentId) : undefined;
  const now = Date.now();
  const tv = timerView(cur, now);
  const live = await liveRow(aid);
  const stepKeep = live?.step ?? "";

  if (action === "draw") {
    // 관리자 선택 회원 활동은 활동 전에 출석 체크를 완료해야 시작할 수 있다.
    const gate = await onsiteGate(ctx.cfg, ctx.act);
    if (gate) return { ok: false, error: gate, status: 409 };
    if (current && current.nameRevealed !== "true") return { ok: false, error: "지금 고민의 이름 오픈까지 마친 뒤에 다음 고민을 뽑을 수 있어요.", status: 409 };
    // 이미 나온 고민은 제외하고, 카테고리를 지정하면 그 안에서만 뽑는다.
    // 현장 참석자만 참여하는 활동이면 참석을 신청한 회원의 고민만 뽑는다.
    const join = await joinSet(ctx.cfg, ctx.act, ctx.ev);
    const pool = rows.filter((w) => !w.drawnAt && (!p.category || w.category === p.category) && (!join || join.has(w.memberId)));
    if (pool.length === 0) return { ok: false, error: p.category ? `“${p.category}” 고민이 더 없어요.` : "뽑을 고민이 더 없어요.", status: 409 };
    const pick = pool[randomInt(pool.length)];
    const order = rows.reduce((n, w) => Math.max(n, Number(w.orderNo) || 0), 0) + 1;
    const minutes = p.minutes ?? (await getSetting<number>("worryMinutes", 15));
    await s.update("Worries", pick.id, { drawnAt: new Date(now).toISOString(), orderNo: String(order), nameRevealed: "false", authorShown: "false" });
    payload.worry = { currentId: pick.id, endsAt: new Date(now + minutes * 60_000).toISOString(), remainingMs: null, minutes, tips: [] };
    await setLive(aid, "talk", true, payload);
    return { ok: true };
  }

  if (!cur || !current || !tv) return { ok: false, error: "먼저 고민을 뽑아 주세요.", status: 409 };

  if (action === "pause") {
    if (tv.paused || tv.timeUp) return { ok: false, error: "지금은 일시정지할 수 없어요.", status: 409 };
    cur.remainingMs = tv.remainingMs;
    cur.endsAt = "";
  } else if (action === "resume") {
    if (!tv.paused) return { ok: false, error: "일시정지 중이 아니에요.", status: 409 };
    cur.endsAt = new Date(now + (cur.remainingMs as number)).toISOString();
    cur.remainingMs = null;
  } else if (action === "extend") {
    const ms = (p.minutes ?? 5) * 60_000;
    if (tv.paused) cur.remainingMs = (cur.remainingMs as number) + ms;
    else cur.endsAt = new Date(Math.max(now, Date.parse(cur.endsAt)) + ms).toISOString();
  } else if (action === "skip") {
    cur.endsAt = new Date(now).toISOString(); // 건너뛰기: 남은 시간을 끝내고 이름 오픈으로 넘어간다
    cur.remainingMs = null;
  } else if (action === "reveal") {
    if (!tv.timeUp) return { ok: false, error: "대화 시간이 끝난 뒤에 이름을 오픈할 수 있어요. 바로 넘기려면 건너뛰기를 눌러 주세요.", status: 409 };
    await s.update("Worries", current.id, { nameRevealed: "true" });
    await setLive(aid, "reveal", true, payload);
    return { ok: true };
  } else if (action === "tips") {
    if (!isAiEnabled()) return { ok: false, error: "AI가 아직 연결되지 않았어요. 연결되면 관점 3가지를 보여 드릴 수 있어요.", status: 503 };
    const gl = await guidelinesFor("worry");
    const out = await ask(
      `당신은 원우회 대화를 돕는 진행 도우미입니다. 한국어로, 아래 고민에 대한 서로 다른 관점 3가지를 각각 한 문장으로 짧게 제시하세요. 줄바꿈으로 구분하고 번호나 기호는 붙이지 마세요.\n\n[관리자 지침]\n${gl}`,
      [{ role: "user", content: current.body }],
      500,
    );
    if (!out) return { ok: false, error: "AI가 응답하지 않았어요.", status: 503 };
    cur.tips = out.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 3);
  }
  await setLive(aid, stepKeep || "talk", live?.memberUnlocked === "true", payload);
  return { ok: true };
}

/* ───── 회원 휴대폰에 보이는 진행 중인 고민 ───── */
export type MemberWorry = {
  canJoin: boolean;
  body: string;
  category: string;
  orderNo: number;
  paused: boolean;
  remainingMs: number;
  timeUp: boolean;
  nameRevealed: boolean;
  displayName: string;
  isMine: boolean;
  canSelfReveal: boolean;
  tips: string[];
  serverNow: number;
};

export async function memberWorry(act: Row, ev: Row, memberId: string, cfg: TemplateConfig): Promise<MemberWorry | null> {
  const aid = act.id;
  const live = await liveRow(aid);
  if (!liveView(cfg, live).active) return null;
  const payload = parseJson<Payload>(live?.payload, {});
  const cur = payload.worry;
  const tv = timerView(cur);
  if (!cur || !tv) return null;
  const w = (await worryRows(aid)).find((x) => x.id === cur.currentId);
  if (!w) return null;
  const revealed = w.nameRevealed === "true";
  const mine = w.memberId === memberId;
  return {
    canJoin: await canJoin(cfg, act, ev, memberId),
    body: w.body,
    category: w.category,
    orderNo: Number(w.orderNo),
    paused: tv.paused,
    remainingMs: tv.remainingMs,
    timeUp: tv.timeUp,
    nameRevealed: revealed,
    displayName: await displayName(w),
    isMine: mine,
    canSelfReveal: mine && w.anonymous === "true" && revealed && w.authorShown !== "true",
    tips: cur.tips,
    serverNow: Date.now(),
  };
}
