import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { LEGS, cars, conflict, saveCarpoolState, suggestName, timeOrder, toCar } from "@/lib/carpool";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; cid: string }> };

const body = z.object({
  leg: z.enum(LEGS).optional(),
  name: z.string().trim().max(30).optional(),
  plate: z.string().trim().max(20).optional(),
  driverId: z.string().optional(),
  seats: z.number().int().min(1).max(12).optional(),
  from: z.string().trim().max(60).optional(),
  to: z.string().trim().max(60).optional(),
  departAt: z.string().trim().max(40).optional(),
  arriveAt: z.string().trim().max(40).optional(),
  riders: z.array(z.string()).max(12).optional(),
});

// 차량 수정(구간, 운전자, 좌석, 출발지, 출발 시간, 동승자). 같은 구간에 두 대에 들어가는 사람이 없도록 검사한다.
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id, cid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const s = await getStore();
  const row = (await s.list("Carpools")).find((c) => c.id === cid && c.eventId === id);
  if (!row) return bad("차량을 찾을 수 없어요.", 404);
  const members = await s.list("Members");
  const d = parsed.data;
  if ((d.driverId && !members.some((m) => m.id === d.driverId)) || (d.riders && d.riders.some((r) => !members.some((m) => m.id === r)))) return bad("명단에 없는 회원이에요.");

  const cur = toCar(row);
  const next = { ...cur, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as typeof cur;
  if (!next.name) next.name = suggestName((await cars(id)).filter((c) => c.id !== cid));
  const order = timeOrder(next.departAt, next.arriveAt);
  if (order) return bad(order);
  const why = conflict(await cars(id), next, new Map(members.map((m) => [m.id, m.name])));
  if (why) return bad(why, 409);
  await s.update("Carpools", cid, {
    name: next.name, plate: next.plate, leg: next.leg, driverId: next.driverId, seats: String(next.seats), from: next.from, to: next.to,
    departAt: next.departAt, arriveAt: next.arriveAt, riders: JSON.stringify(next.riders),
  });
  await saveCarpoolState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id, cid } = await ctx.params;
  const s = await getStore();
  if (!(await s.list("Carpools")).some((c) => c.id === cid && c.eventId === id)) return bad("차량을 찾을 수 없어요.", 404);
  await s.remove("Carpools", cid);
  await saveCarpoolState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ ok: true });
}
