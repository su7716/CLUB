import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { gTeams } from "@/lib/groups";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// 조편성 목록(활동 개수에 따라 여러 개를 만들 수 있다)
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["events", "activities"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const rows = (await (await getStore()).list("Groupings")).filter((x) => x.eventId === id);
  return NextResponse.json({
    groups: rows.map((x) => {
      const t = gTeams(x);
      return { id: x.id, title: x.title, published: x.published === "true", teamCount: t.length, memberCount: t.reduce((n, y) => n + y.memberIds.length, 0) };
    }),
  });
}

const body = z.object({ title: z.string().trim().min(1).max(60) });

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(["events", "activities"]);
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("조편성 이름을 입력해 주세요. 예: 저녁 게임");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("행사를 찾을 수 없어요.", 404);
  const row = await s.insert("Groupings", { eventId: id, title: parsed.data.title, teams: "[]", published: "false", updatedAt: new Date().toISOString() });
  return NextResponse.json({ id: row.id });
}
