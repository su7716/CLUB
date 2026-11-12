import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { doAction, loadStage } from "@/lib/rounds";

const body = z.object({
  action: z.enum(["open", "results", "ready", "name", "vote", "close", "answer"]),
  targetMemberId: z.string().optional(), // open 일 때 순서를 지정하면 그 사람, 없으면 무작위
});

// 사회자 버튼(소개 열기, 추측 결과, 저예요 열기, 이름 공개, 투표, 마감, 정답 공개)
export async function POST(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const st = await loadStage(id, aid);
  if (typeof st === "string") return bad(st, 404);
  const r = await doAction(st, parsed.data.action, parsed.data.targetMemberId);
  if (!r.ok) return bad(r.error, r.status ?? 400);
  return NextResponse.json({ ok: true });
}
