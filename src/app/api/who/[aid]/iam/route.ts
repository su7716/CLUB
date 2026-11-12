import { NextResponse } from "next/server";
import { liveView } from "@/lib/activities";
import { bad, guard } from "@/lib/api";
import { NOT_ATTENDEE, canJoin } from "@/lib/participants";
import { currentRound, liveRow } from "@/lib/rounds";
import { getStore } from "@/lib/store";
import { loadWho } from "@/lib/who";

// 당사자가 휴대폰에서 "저예요"를 누르면 사회자 화면에 이름이 공개된다.
// 템플릿 설정상 이 단계의 회원 화면이 '저예요 버튼'으로 켜져 있을 때만 동작한다.
export async function POST(_req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;

  if (!(await canJoin(w.cfg, w.act, w.ev, g.s.mid))) return bad(NOT_ATTENDEE, 403);
  const cur = await currentRound(aid);
  if (!cur) return bad("지금 진행 중인 소개가 없어요.", 409);
  if (cur.targetMemberId !== g.s.mid) return bad("본인 차례에만 누를 수 있어요.", 403);
  const view = liveView(w.cfg, await liveRow(aid));
  if (view.memberScreen !== "iam_button" || cur.state !== "reveal") return bad("아직 이름을 밝힐 차례가 아니에요.", 409);

  await (await getStore()).update("Rounds", cur.id, { nameRevealed: "true", updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
