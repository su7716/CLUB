import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { roomState, rooms, saveRoomState, validDate } from "@/lib/rooms";
import { getStore } from "@/lib/store";

const body = z.object({
  action: z.enum(["publish", "unpublish", "copy"]),
  from: z.string().refine(validDate).optional(),
  to: z.string().refine(validDate).optional(),
});

// publish: 확인(회원에게 배포) / unpublish: 배포 취소 / copy: 한 날짜의 방 구성(방 이름·정원·투숙자)을 다른 날짜로 복사
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const s = await getStore();
  const { action, from, to } = parsed.data;

  if (action === "unpublish") {
    await saveRoomState(id, { published: false, publishedAt: "" });
    return NextResponse.json({ ok: true });
  }
  if (action === "copy") {
    if (!from || !to || from === to) return bad("복사할 날짜와 받을 날짜를 서로 다르게 골라 주세요.");
    const all = await rooms(id);
    const src = all.filter((r) => r.date === from);
    if (src.length === 0) return bad("복사할 방이 없어요.", 409);
    if (all.some((r) => r.date === to)) return bad("받을 날짜에 이미 방이 있어요. 먼저 비워 주세요.", 409);
    for (const r of src) {
      await s.insert("Rooms", { eventId: id, date: to, name: r.name, capacity: String(r.capacity), memo: r.memo, guests: JSON.stringify(r.guests) });
    }
    await saveRoomState(id, { published: false, publishedAt: "" });
    return NextResponse.json({ ok: true, copied: src.length });
  }
  if ((await rooms(id)).length === 0) return bad("배포할 방이 없어요. 먼저 방을 만들어 주세요.", 409);
  if ((await roomState(id)).published) return NextResponse.json({ ok: true });
  await saveRoomState(id, { published: true, publishedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
