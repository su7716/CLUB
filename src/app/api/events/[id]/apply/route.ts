import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

const body = z.object({
  answer: z.enum(["참석", "불참"]),
  // 참석 날짜(YYYY-MM-DD). 행사 기간 안의 날짜만 받는다.
  days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(7).optional(),
});

// 참석 신청 / 참석 안함 / 졸업여행 날짜 선택. 나중에 바꿀 수 있다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const { answer, days } = parsed.data;

  const s = await getStore();
  const ev = (await s.list("Events")).find((x) => x.id === id && x.published === "true");
  if (!ev) return bad("행사를 찾을 수 없어요.", 404);

  if (days && days.length > 0) {
    const from = (ev.startsAt || "").slice(0, 10);
    const to = (ev.endsAt || ev.startsAt || "").slice(0, 10);
    if (!from || days.some((d) => d < from || d > to)) return bad("행사 기간 안의 날짜를 골라 주세요.");
  }

  const rows = await s.list("EventApplies");
  const cur = rows.find((r) => r.eventId === id && r.memberId === g.s.mid);

  // 불참이면 날짜를 비운다. 참석이면 넘어온 날짜(없으면 기존 날짜)를 저장한다.
  const nextDays = answer === "불참" ? "" : days ? [...days].sort().join(",") : cur?.days ?? "";

  if (cur) {
    await s.update("EventApplies", cur.id, { answer, days: nextDays });
  } else {
    await s.insert("EventApplies", { eventId: id, memberId: g.s.mid, answer, days: nextDays, paid: "false" });
  }
  return NextResponse.json({ ok: true });
}
