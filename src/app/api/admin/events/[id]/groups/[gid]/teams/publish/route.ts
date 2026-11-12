import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { gTeams, groupPool, loadGrouping } from "@/lib/groups";
import { getStore } from "@/lib/store";

const body = z.object({ action: z.enum(["publish", "unpublish"]) });

// "확인": 조편성을 회원에게 배포한다. 배포 전에는 회원 화면에 보이지 않는다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string; gid: string }> }) {
  const g = await guard(["events", "activities"]);
  if ("err" in g) return g.err;
  const { id, gid } = await ctx.params;
  const c = await loadGrouping(id, gid);
  if (!c) return bad("조편성을 찾을 수 없어요.", 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const s = await getStore();

  if (parsed.data.action === "unpublish") {
    await s.update("Groupings", gid, { published: "false" });
    return NextResponse.json({ ok: true });
  }
  const teams = gTeams(c.g);
  if (teams.length === 0) return bad("배포할 조가 없어요. 먼저 조를 만들어 주세요.", 409);
  if (teams.some((t) => t.memberIds.length === 0)) return bad("비어 있는 조가 있어요. 회원을 옮기거나 빈 조를 지워 주세요.", 409);
  const pool = (await groupPool(c.ev)).members;
  const assigned = new Set(teams.flatMap((t) => t.memberIds));
  const left = pool.filter((m) => !assigned.has(m.id));
  if (left.length > 0) return bad(`아직 조가 없는 사람이 있어요: ${left.map((m) => m.name).join(", ")}`, 409);
  await s.update("Groupings", gid, { published: "true", updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
