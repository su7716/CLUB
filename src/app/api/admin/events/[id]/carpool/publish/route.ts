import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { autoAssign, carpoolState, cars, saveCarpoolState } from "@/lib/carpool";
import { getStore } from "@/lib/store";

const body = z.object({ action: z.enum(["publish", "unpublish", "auto"]) });

// publish: 확인(회원에게 배포) / unpublish: 배포 취소 / auto: 빈 좌석 자동 배정
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(["events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const s = await getStore();

  if (parsed.data.action === "unpublish") {
    await saveCarpoolState(id, { published: false, publishedAt: "" });
    return NextResponse.json({ ok: true });
  }
  if (parsed.data.action === "auto") {
    const [members, applies] = await Promise.all([s.list("Members"), s.list("EventApplies")]);
    const att = members.filter((m) => m.kind !== "회원대기" && applies.some((a) => a.eventId === id && a.memberId === m.id && a.answer === "참석")).map((m) => m.id);
    const added = await autoAssign(id, att);
    if (added > 0) await saveCarpoolState(id, { published: false, publishedAt: "" });
    return NextResponse.json({ ok: true, added });
  }
  if ((await cars(id)).length === 0) return bad("배포할 차량이 없어요. 먼저 차량을 등록해 주세요.", 409);
  if ((await carpoolState(id)).published) return NextResponse.json({ ok: true });
  await saveCarpoolState(id, { published: true, publishedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
