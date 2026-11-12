import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { capsuleRows, loadCapsule, saveTeamsState, teams } from "@/lib/capsule";
import { participantPool } from "@/lib/participants";

const body = z.object({ action: z.enum(["publish", "unpublish"]) });

// "확인": 팀 구성을 회원에게 배포한다. 배포 전에는 회원 화면에 팀이 보이지 않고 팀 약속도 쓸 수 없다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadCapsule(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");

  if (parsed.data.action === "unpublish") {
    if ((await capsuleRows(aid)).length > 0) return bad("이미 작성된 타임캡슐이 있어서 배포를 되돌릴 수 없어요.", 409);
    await saveTeamsState(aid, { published: false, publishedAt: "", by: "" });
    return NextResponse.json({ ok: true });
  }

  const ts = await teams(aid);
  if (ts.length === 0) return bad("배포할 팀이 없어요. 먼저 팀을 만들어 주세요.", 409);
  if (ts.some((t) => t.memberIds.length === 0)) return bad("비어 있는 팀이 있어요. 회원을 옮기거나 빈 팀을 지워 주세요.", 409);

  // 참여자 중 팀이 없는 사람이 있으면 배포하지 않는다(팀 약속을 쓸 수 없게 되므로).
  const pool = (await participantPool(c.cfg, c.act, c.ev)).members;
  const assigned = new Set(ts.flatMap((t) => t.memberIds));
  const left = pool.filter((m) => !assigned.has(m.id));
  if (left.length > 0) return bad(`아직 팀이 없는 사람이 있어요: ${left.map((m) => m.name).join(", ")}`, 409);

  await saveTeamsState(aid, { published: true, publishedAt: new Date().toISOString(), by: g.s.name });
  return NextResponse.json({ ok: true });
}
