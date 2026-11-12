import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

const dt = z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/);
const body = z.object({ startsAt: dt, endsAt: dt });

// 이 활동이 진행되는 날짜와 시간(한국 시간). 회원에게 알려 주는 안내용 정보이며,
// 참여 대상(출석 체크)이나 정보 노출과는 연결하지 않는다.
export async function PUT(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("날짜와 시간을 함께 입력해 주세요.");
  const { startsAt, endsAt } = parsed.data;
  if (endsAt && !startsAt) return bad("시작 일시를 먼저 입력해 주세요.");
  if (startsAt && endsAt && endsAt < startsAt) return bad("끝나는 시간이 시작보다 빠를 수 없어요.");

  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);
  await s.update("EventActivities", aid, { startsAt, endsAt });
  return NextResponse.json({ ok: true });
}
