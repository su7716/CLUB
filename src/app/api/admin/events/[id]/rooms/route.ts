import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { nightsOf, roomState, rooms, saveRoomState, suggestRoomName, validDate } from "@/lib/rooms";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 숙박 방배정(날짜별). 배포 전에는 회원에게 보이지 않는다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, members, applies, all, state] = await Promise.all([s.list("Events"), s.list("Members"), s.list("EventApplies"), rooms(id), roomState(id)]);
  const ev = events.find((e) => e.id === id);
  if (!ev) return bad("행사를 찾을 수 없어요.", 404);
  const live = members.filter((m) => m.kind !== "회원대기");
  const att = live.filter((m) => applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")).map((m) => m.id);
  const dates = [...new Set([...nightsOf(ev.startsAt, ev.endsAt), ...all.map((r) => r.date)])].sort();
  const free = Object.fromEntries(dates.map((d) => [d, att.filter((p) => !all.some((r) => r.date === d && r.guests.includes(p)))]));
  return NextResponse.json({
    published: state.published,
    nights: nightsOf(ev.startsAt, ev.endsAt),
    dates,
    members: live.map((m) => ({ id: m.id, name: m.name })),
    attendingIds: att,
    rooms: all.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name, "ko", { numeric: true })),
    free,
  });
}

const body = z.object({
  date: z.string().refine(validDate, "날짜를 확인해 주세요."),
  name: z.string().trim().max(30).default(""),
  capacity: z.number().int().min(1).max(20).default(2),
  memo: z.string().trim().max(100).default(""),
});

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("날짜와 정원을 확인해 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("행사를 찾을 수 없어요.", 404);
  const all = await rooms(id);
  const name = parsed.data.name || suggestRoomName(all, parsed.data.date);
  if (all.some((r) => r.date === parsed.data.date && r.name === name)) return bad("같은 날짜에 같은 이름의 방이 있어요.", 409);
  const row = await s.insert("Rooms", { eventId: id, date: parsed.data.date, name, capacity: String(parsed.data.capacity), memo: parsed.data.memo, guests: "[]" });
  await saveRoomState(id, { published: false, publishedAt: "" });
  return NextResponse.json({ id: row.id });
}
