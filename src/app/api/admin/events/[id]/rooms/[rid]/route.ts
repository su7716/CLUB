import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { roomConflict, rooms, saveRoomState, suggestRoomName, toRoom, validDate } from "@/lib/rooms";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; rid: string }> };

const body = z.object({
  date: z.string().refine(validDate).optional(),
  name: z.string().trim().max(30).optional(),
  capacity: z.number().int().min(1).max(20).optional(),
  memo: z.string().trim().max(100).optional(),
  guests: z.array(z.string()).max(20).optional(),
});

// 방 수정(날짜, 이름, 정원, 메모, 투숙자). 같은 날짜에 두 방에 들어가는 사람이 없도록 검사한다.
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id, rid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const s = await getStore();
  const row = (await s.list("Rooms")).find((r) => r.id === rid && r.eventId === id);
  if (!row) return bad("방을 찾을 수 없어요.", 404);
  const members = await s.list("Members");
  const d = parsed.data;
  if (d.guests?.some((x) => !members.some((m) => m.id === x))) return bad("명단에 없는 회원이에요.");

  const all = await rooms(id);
  const next = { ...toRoom(row), ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== undefined)) } as ReturnType<typeof toRoom>;
  if (!next.name) next.name = suggestRoomName(all.filter((r) => r.id !== rid), next.date);
  if (all.some((r) => r.id !== rid && r.date === next.date && r.name === next.name)) return bad("같은 날짜에 같은 이름의 방이 있어요.", 409);
  const why = roomConflict(all, next, new Map(members.map((m) => [m.id, m.name])));
  if (why) return bad(why, 409);
  await s.update("Rooms", rid, { date: next.date, name: next.name, capacity: String(next.capacity), memo: next.memo, guests: JSON.stringify(next.guests) });
  await saveRoomState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id, rid } = await ctx.params;
  const s = await getStore();
  if (!(await s.list("Rooms")).some((r) => r.id === rid && r.eventId === id)) return bad("방을 찾을 수 없어요.", 404);
  await s.remove("Rooms", rid);
  await saveRoomState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ ok: true });
}
