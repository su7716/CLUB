import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { CLUB, clubError, isClubKind } from "@/lib/club";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ kind: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isClubKind(kind)) return bad("없는 항목이에요.", 404);
  const def = CLUB[kind];
  const g = await guard(def.perm);
  if ("err" in g) return g.err;
  const rows = (await (await getStore()).list(def.tab)).sort(def.sort);
  return NextResponse.json({ items: rows.map(def.view) });
}

export async function POST(req: Request, ctx: Ctx) {
  const { kind } = await ctx.params;
  if (!isClubKind(kind)) return bad("없는 항목이에요.", 404);
  const def = CLUB[kind];
  const g = await guard(def.perm);
  if ("err" in g) return g.err;
  const parsed = def.schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad(clubError(parsed.error));
  const row = await (await getStore()).insert(def.tab, parsed.data);
  return NextResponse.json({ item: def.view(row) });
}
