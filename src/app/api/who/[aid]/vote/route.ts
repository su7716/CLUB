import { NextResponse } from "next/server";
import { z } from "zod";
import { liveView } from "@/lib/activities";
import { bad, guard } from "@/lib/api";
import { NOT_ATTENDEE, canJoin } from "@/lib/participants";
import { currentRound, liveRow } from "@/lib/rounds";
import { getStore } from "@/lib/store";
import { loadWho } from "@/lib/who";

const body = z.object({ chosenIndex: z.number().int().min(0).max(2) });

// 거짓 투표: 1인 1회, 본인 차례는 불가, 마감 후 변경 불가.
// 사회자가 투표를 열어서 회원 화면이 '투표'로 켜져 있을 때만 받는다(템플릿 설정을 따른다).
export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("1~3번 중에서 골라 주세요.");

  if (!(await canJoin(w.cfg, w.act, w.ev, g.s.mid))) return bad(NOT_ATTENDEE, 403);
  const cur = await currentRound(aid);
  if (!cur) return bad("지금 진행 중인 소개가 없어요.", 409);
  if (cur.targetMemberId === g.s.mid) return bad("내 차례에는 투표할 수 없어요.", 403);
  const view = liveView(w.cfg, await liveRow(aid));
  if (cur.state !== "voting" || !view.unlocked || view.memberScreen !== "vote") return bad("지금은 투표할 수 없어요. 사회자가 투표를 열면 할 수 있어요.", 409);

  const s = await getStore();
  const dup = (await s.list("Votes")).find((v) => v.roundId === cur.id && v.voterId === g.s.mid);
  if (dup) return bad("이미 투표했어요. 한 번만 할 수 있어요.", 409);
  await s.insert("Votes", { roundId: cur.id, voterId: g.s.mid, chosenIndex: String(parsed.data.chosenIndex), createdAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
