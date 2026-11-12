import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { readConfig, templateInput } from "@/lib/activities";
import { getStore } from "@/lib/store";

type Ctx = { params: Promise<{ id: string }> };

// 템플릿 수정: 버전이 1 올라간다. 이미 행사에 넣은 활동은 그때 복사해 둔 설정을 그대로 쓰므로 영향이 없다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = templateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("템플릿 설정을 확인해 주세요.");
  const s = await getStore();
  const cur = (await s.list("ActivityTemplates")).find((t) => t.id === id);
  if (!cur) return bad("템플릿을 찾을 수 없어요.", 404);
  const version = (Number(cur.version) || 1) + 1;
  const config = { ...parsed.data, id, version };
  await s.update("ActivityTemplates", id, { name: config.name, version: String(version), config: JSON.stringify(config) });
  return NextResponse.json({ template: { id, origin: cur.origin, version, config } });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const cur = (await s.list("ActivityTemplates")).find((t) => t.id === id);
  if (!cur) return bad("템플릿을 찾을 수 없어요.", 404);
  if (cur.origin === "default") return bad("기본 템플릿은 지울 수 없어요. 복제해서 쓰세요.");
  if (!readConfig(cur.config)) return bad("설정을 읽을 수 없는 템플릿이에요.");
  await s.remove("ActivityTemplates", id);
  return NextResponse.json({ ok: true });
}
