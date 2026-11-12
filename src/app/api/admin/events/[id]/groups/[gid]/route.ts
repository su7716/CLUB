import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { loadGrouping } from "@/lib/groups";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string; gid: string }> };

const body = z.object({ title: z.string().trim().min(1).max(60) });

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(["events", "activities"]);
  if ("err" in g) return g.err;
  const { id, gid } = await ctx.params;
  const c = await loadGrouping(id, gid);
  if (!c) return bad("조편성을 찾을 수 없어요.", 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("이름을 입력해 주세요.");
  await (await getStore()).update("Groupings", gid, { title: parsed.data.title });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard(["events", "activities"]);
  if ("err" in g) return g.err;
  const { id, gid } = await ctx.params;
  const c = await loadGrouping(id, gid);
  if (!c) return bad("조편성을 찾을 수 없어요.", 404);
  await (await getStore()).remove("Groupings", gid);
  return NextResponse.json({ ok: true });
}
