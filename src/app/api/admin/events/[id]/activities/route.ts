import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { liveView, preStatus, readConfig } from "@/lib/activities";
import { attendanceState, rosterSet } from "@/lib/participants";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 행사에 들어간 활동 + 현재 사전 작성 상태 + 현장 진행 상태
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, acts, lives] = await Promise.all([s.list("Events"), s.list("EventActivities"), s.list("LiveState")]);
  const ev = events.find((e) => e.id === id);
  if (!ev) return bad("행사를 찾을 수 없어요.", 404);

  const mine = acts.filter((a) => a.eventId === id).sort((a, b) => Number(a.order) - Number(b.order));
  const rosterCounts = await Promise.all(mine.map(async (a) => (await rosterSet(a)).size));
  const states = await Promise.all(mine.map((a) => attendanceState(a.id)));
  const activities = mine.flatMap((a, i) => {
    const config = readConfig(a.config);
    if (!config) return [];
    const live = lives.find((l) => l.eventActivityId === a.id);
    return [{
      id: a.id,
      templateId: a.templateId,
      templateVersion: Number(a.templateVersion) || 1,
      config,
      pre: preStatus(config, ev.startsAt),
      live: liveView(config, live),
      // 활동의 날짜와 진행 시간은 안내용 정보다(참여 대상 판정과 연결하지 않는다).
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      rosterCount: rosterCounts[i],
      attendanceConfirmed: states[i].confirmed,
    }];
  });
  return NextResponse.json({ activities });
}

const addBody = z.object({ templateId: z.string().min(1) });

// 템플릿에서 활동을 골라 행사에 넣는다. 설정은 그 시점 것을 복사해 행사별로 따로 수정할 수 있다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = addBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("템플릿을 골라 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("행사를 찾을 수 없어요.", 404);
  const tpl = (await s.list("ActivityTemplates")).find((t) => t.id === parsed.data.templateId);
  if (!tpl || !readConfig(tpl.config)) return bad("템플릿을 찾을 수 없어요.", 404);

  const acts = (await s.list("EventActivities")).filter((a) => a.eventId === id);
  const order = acts.reduce((n, a) => Math.max(n, Number(a.order) || 0), 0) + 1;
  const row = await s.insert("EventActivities", {
    eventId: id,
    templateId: tpl.id,
    templateVersion: tpl.version,
    config: tpl.config,
    state: "ready",
    order: String(order),
  });
  return NextResponse.json({ activity: { id: row.id } });
}
