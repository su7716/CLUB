import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// 행사 상세: 개요, 회원별 신청·회비 현황(미응답 회원 포함)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["events", "fees"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members, applies] = await Promise.all([
    s.list("Events"),
    s.list("Members"),
    s.list("EventApplies"),
  ]);
  const event = events.find((e) => e.id === id);
  if (!event) return bad("행사를 찾을 수 없어요.", 404);

  const rows = members
    .filter((m) => m.kind !== "회원대기")
    .map((m) => {
      const a = applies.find((x) => x.eventId === id && x.memberId === m.id);
      return {
        memberId: m.id,
        name: m.name,
        answer: a?.answer ?? "",
        days: a?.days ?? "",
        paid: a?.paid === "true",
        paidAt: a?.paidAt ?? "",
      };
    });
  return NextResponse.json({ event, rows });
}

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  startsAt: z.string().max(30).optional(),
  endsAt: z.string().max(30).optional(),
  place: z.string().max(120).optional(),
  booking: z.string().max(300).optional(),
  status: z.string().max(30).optional(),
  published: z.boolean().optional(),
  fee: z.string().regex(/^\d{0,9}$/).optional(),
  feeDeadline: z.string().max(30).optional(),
  account: z.string().max(120).optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(["events", "fees"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 회비는 숫자만 넣어 주세요.");
  const { published, ...rest } = parsed.data;
  const s = await getStore();
  const row = await s.update("Events", id, {
    ...rest,
    ...(published === undefined ? {} : { published: String(published) }),
  });
  if (!row) return bad("행사를 찾을 수 없어요.", 404);
  return NextResponse.json({ event: row });
}
