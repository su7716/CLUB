import { NextResponse } from "next/server";
import { z } from "zod";
import { liveView } from "@/lib/activities";
import { bad, guard } from "@/lib/api";
import { joinSet } from "@/lib/participants";
import { liveRow } from "@/lib/rounds";
import {
  CATEGORIES, displayName, doWorryAction, loadWorry, missingWorrySteps, readPayload, timerView, worryRows,
} from "@/lib/worry";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; aid: string }> };

// 사회자 전체화면이 읽는 곳. 뽑히기 전 고민과 작성자는 내려주지 않는다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const w = await loadWorry(aid, id);
  if (typeof w === "string") return bad(w, 404);

  const rows = await worryRows(aid);
  const join = await joinSet(w.cfg, w.act, w.ev);
  const usable = rows.filter((x) => !join || join.has(x.memberId));
  const payload = await readPayload(aid);
  const cur = payload.worry;
  const current = cur?.currentId ? rows.find((x) => x.id === cur.currentId) : undefined;
  const tv = timerView(cur);

  return NextResponse.json({
    event: { id: w.ev.id, name: w.ev.name },
    activity: { id: aid, name: w.cfg.name, participants: w.cfg.participants },
    missingSteps: missingWorrySteps(w.cfg),
    live: liveView(w.cfg, await liveRow(aid)),
    serverNow: Date.now(),
    categories: CATEGORIES,
    // 남은 고민 수만 알려준다(카테고리별 포함). 내용은 내려주지 않는다.
    counts: {
      total: usable.length,
      drawn: usable.filter((x) => x.drawnAt).length,
      remaining: usable.filter((x) => !x.drawnAt).length,
      byCategory: Object.fromEntries(CATEGORIES.map((c) => [c, usable.filter((x) => !x.drawnAt && x.category === c).length])),
    },
    current: current && tv
      ? {
          id: current.id, body: current.body, category: current.category, orderNo: Number(current.orderNo),
          paused: tv.paused, remainingMs: tv.remainingMs, timeUp: tv.timeUp, minutes: cur?.minutes ?? 15,
          nameRevealed: current.nameRevealed === "true", displayName: await displayName(current), tips: cur?.tips ?? [],
        }
      : null,
  });
}

const body = z.object({
  action: z.enum(["draw", "pause", "resume", "extend", "skip", "reveal", "tips"]),
  category: z.enum(CATEGORIES).optional(),
  minutes: z.number().int().min(1).max(120).optional(),
});

// 사회자 버튼: 고민 뽑기(카테고리 지정 가능), 일시정지, 재개, 연장, 건너뛰기, 이름 오픈, AI 관점
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const w = await loadWorry(aid, id);
  if (typeof w === "string") return bad(w, 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const r = await doWorryAction(w, parsed.data.action, { category: parsed.data.category, minutes: parsed.data.minutes });
  if (!r.ok) return bad(r.error, r.status ?? 400);
  return NextResponse.json({ ok: true });
}
