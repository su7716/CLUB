import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { LEGS, carpoolState, cars, conflict, freeFor, saveCarpoolState, suggestName, timeOrder } from "@/lib/carpool";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 카풀 배정(왕복, 갈 때, 올 때). 배포 전에는 회원에게 보이지 않는다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [members, applies, all, state] = await Promise.all([s.list("Members"), s.list("EventApplies"), cars(id), carpoolState(id)]);
  const live = members.filter((m) => m.kind !== "회원대기");
  const att = live.filter((m) => applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")).map((m) => m.id);
  const free = freeFor(all, att);
  return NextResponse.json({
    published: state.published,
    legs: LEGS,
    members: live.map((m) => ({ id: m.id, name: m.name })),
    attendingIds: att,
    cars: all,
    free,
  });
}

const body = z.object({
  leg: z.enum(LEGS),
  name: z.string().trim().max(30).default(""),
  plate: z.string().trim().max(20).default(""),
  driverId: z.string().default(""),
  seats: z.number().int().min(1).max(12).default(4),
  from: z.string().trim().max(60).default(""),
  to: z.string().trim().max(60).default(""),
  departAt: z.string().trim().max(40).default(""),
  arriveAt: z.string().trim().max(40).default(""),
});

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("행사를 찾을 수 없어요.", 404);
  const members = await s.list("Members");
  if (parsed.data.driverId && !members.some((m) => m.id === parsed.data.driverId)) return bad("명단에 없는 회원이에요.");

  const names = new Map(members.map((m) => [m.id, m.name]));
  const existing = await cars(id);
  const car = { id: "new", ...parsed.data, name: parsed.data.name || suggestName(existing), riders: [] as string[] };
  const why = conflict(existing, car, names);
  if (why) return bad(why, 409);
  const order = timeOrder(car.departAt, car.arriveAt);
  if (order) return bad(order);
  const row = await s.insert("Carpools", {
    eventId: id, name: car.name, plate: car.plate, leg: car.leg, driverId: car.driverId, seats: String(car.seats), from: car.from, to: car.to,
    departAt: car.departAt, arriveAt: car.arriveAt, riders: "[]",
  });
  // 구성이 바뀌면 다시 배포해야 한다.
  await saveCarpoolState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ id: row.id });
}
