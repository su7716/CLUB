import { NextResponse } from "next/server";
import { preStatus } from "@/lib/activities";
import { bad, guard } from "@/lib/api";
import { NOT_ATTENDEE, canJoin } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { CATEGORIES, MAX_WORRIES, loadWorry, worryBody, worryRows } from "@/lib/worry";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ aid: string }> };

const WHY: Record<string, string> = {
  none: "이 활동에는 사전 작성이 없어요.",
  unknown: "행사 날짜가 정해지면 작성 기간이 열려요.",
  before: "아직 작성 기간이 아니에요.",
  closed: "작성 기간이 끝났어요.",
};

// 내 고민 목록(본인 것만). 다른 회원과 관리자에게는 뽑히기 전까지 보이지 않는다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWorry(aid);
  if (typeof w === "string") return bad(w, 404);
  const mine = (await worryRows(aid)).filter((x) => x.memberId === g.s.mid);
  return NextResponse.json({
    activity: { id: aid, name: w.cfg.name },
    event: { id: w.ev.id, name: w.ev.name },
    canJoin: await canJoin(w.cfg, w.act, w.ev, g.s.mid),
    pre: preStatus(w.cfg, w.ev.startsAt),
    max: MAX_WORRIES,
    categories: CATEGORIES,
    mine: mine.map((x) => ({ id: x.id, body: x.body, category: x.category, anonymous: x.anonymous === "true", drawn: Boolean(x.drawnAt) })),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWorry(aid);
  if (typeof w === "string") return bad(w, 404);
  // 고민은 이 활동에 참석하는 분만 쓴다. 불참하는 분은 AI 인터뷰로 프로필 북 소개만 작성한다.
  if (!(await canJoin(w.cfg, w.act, w.ev, g.s.mid))) return bad(`${NOT_ATTENDEE} 참여 대상이 아니면 고민은 쓰지 않고 프로필 소개만 작성해 주세요.`, 403);
  const pre = preStatus(w.cfg, w.ev.startsAt);
  if (pre.status !== "open") return bad(`${WHY[pre.status]}${pre.opensAt ? ` (${pre.opensAt} ~ ${pre.closesAt})` : ""}`, 403);

  const parsed = worryBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("고민은 2~500자로 적고, 카테고리와 익명 여부를 골라 주세요.");
  const mine = (await worryRows(aid)).filter((x) => x.memberId === g.s.mid);
  if (mine.length >= MAX_WORRIES) return bad(`고민은 ${MAX_WORRIES}개까지 적을 수 있어요.`);

  const s = await getStore();
  const row = await s.insert("Worries", {
    eventActivityId: aid, memberId: g.s.mid, body: parsed.data.body, category: parsed.data.category,
    anonymous: String(parsed.data.anonymous), nameRevealed: "false", authorShown: "false", updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ id: row.id });
}
