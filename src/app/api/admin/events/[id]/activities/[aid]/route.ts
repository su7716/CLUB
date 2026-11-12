import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { readConfig, templateInput } from "@/lib/activities";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; aid: string }> };

// 이 행사에서만 설정을 고친다(템플릿 보관함은 그대로).
export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = templateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("활동 설정을 확인해 주세요.");
  const s = await getStore();
  const cur = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!cur) return bad("활동을 찾을 수 없어요.", 404);
  const old = readConfig(cur.config);
  const config = { ...parsed.data, id: old?.id ?? aid, version: old?.version ?? 1 };

  // 현장 진행 중인 단계를 지우면 진행 상태가 가리킬 곳이 없어지므로 막는다.
  const live = (await s.list("LiveState")).find((l) => l.eventActivityId === aid);
  if (live?.step && !config.onsite.steps.some((x) => x.key === live.step)) {
    return bad("지금 진행 중인 단계는 지울 수 없어요. 현장 진행을 먼저 되돌려 주세요.");
  }
  await s.update("EventActivities", aid, { config: JSON.stringify(config) });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const s = await getStore();
  const cur = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!cur) return bad("활동을 찾을 수 없어요.", 404);
  await s.remove("EventActivities", aid);
  const live = (await s.list("LiveState")).find((l) => l.eventActivityId === aid);
  if (live) await s.remove("LiveState", live.id);
  return NextResponse.json({ ok: true });
}
