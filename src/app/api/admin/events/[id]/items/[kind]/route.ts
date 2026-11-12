import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { ITEMS, isKind } from "@/lib/items";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; kind: string }> };

// 행사 일정 / 준비 목록 / 비용 목록. 비용은 '회비·비용' 권한이 있는 관리자만 다룬다.
export async function GET(_req: Request, ctx: Ctx) {
  const { id, kind } = await ctx.params;
  if (!isKind(kind)) return bad("없는 목록이에요.", 404);
  const def = ITEMS[kind];
  const g = await guard([...def.perm, "all"]);
  if ("err" in g) return g.err;
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("행사를 찾을 수 없어요.", 404);
  const rows = (await s.list(def.tab)).filter((r) => r.eventId === id).sort(def.sort);
  return NextResponse.json({ items: rows.map(def.view) });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id, kind } = await ctx.params;
  if (!isKind(kind)) return bad("없는 목록이에요.", 404);
  const def = ITEMS[kind];
  const g = await guard(def.perm);
  if ("err" in g) return g.err;
  const parsed = def.schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const s = await getStore();
  if (!(await s.list("Events")).some((e) => e.id === id)) return bad("행사를 찾을 수 없어요.", 404);
  const row = await s.insert(def.tab, { ...parsed.data, eventId: id });
  return NextResponse.json({ item: def.view(row) });
}
