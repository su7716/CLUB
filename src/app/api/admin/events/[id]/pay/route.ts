import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

const body = z.object({ memberId: z.string().min(1), paid: z.boolean() });

// 입금 확인. 확인하면 그 회원 화면의 회비 알림이 사라진다(회원 화면은 이 값으로 알림을 계산한다).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("fees");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const { memberId, paid } = parsed.data;

  const s = await getStore();
  const a = (await s.list("EventApplies")).find((x) => x.eventId === id && x.memberId === memberId);
  if (!a || a.answer !== "참석") return bad("참석을 신청한 회원만 입금을 확인할 수 있어요.");
  await s.update("EventApplies", a.id, {
    paid: String(paid),
    paidAt: paid ? new Date().toISOString().slice(0, 10) : "",
  });
  return NextResponse.json({ ok: true });
}
