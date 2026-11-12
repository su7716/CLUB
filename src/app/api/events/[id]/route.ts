import { NextResponse } from "next/server";
import { bad, guard, parseJson } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원이 보는 행사 개요. 계좌번호는 참석 신청한 회원에게만 내려준다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, applies, acts] = await Promise.all([
    s.list("Events"),
    s.list("EventApplies"),
    s.list("EventActivities"),
  ]);
  const e = events.find((x) => x.id === id && x.published === "true");
  if (!e) return bad("행사를 찾을 수 없어요.", 404);

  const a = applies.find((x) => x.eventId === id && x.memberId === g.s.mid);
  const attending = a?.answer === "참석";
  const activities = acts
    .filter((x) => x.eventId === id)
    .sort((p, q) => Number(p.order) - Number(q.order))
    .map((x) => ({ id: x.id, name: parseJson<{ name?: string }>(x.config, {}).name ?? "활동" }));

  return NextResponse.json({
    event: {
      id: e.id,
      type: e.type,
      name: e.name,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      place: e.place,
      booking: e.booking,
      status: e.status,
      fee: e.fee,
      feeDeadline: e.feeDeadline,
      account: attending ? e.account : "",
    },
    activities,
    apply: a ? { answer: a.answer, days: a.days ? a.days.split(",") : [], paid: a.paid === "true" } : null,
    feeDue: attending && e.fee !== "" && a?.paid !== "true",
  });
}
