import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { newTemplateId, readConfig, templateInput } from "@/lib/activities";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 활동 템플릿 보관함
export async function GET() {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const s = await getStore();
  const rows = await s.list("ActivityTemplates");
  const templates = rows.flatMap((r) => {
    const config = readConfig(r.config);
    return config ? [{ id: r.id, origin: r.origin, version: Number(r.version) || 1, config }] : [];
  });
  return NextResponse.json({ templates });
}

// 새 템플릿 (복제하거나 빈 설정에서 시작)
export async function POST(req: Request) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const parsed = templateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("템플릿 설정을 확인해 주세요. 이름과 현장 단계가 필요해요.");
  const id = newTemplateId();
  const config = { ...parsed.data, id, version: 1 };
  const s = await getStore();
  await s.insert("ActivityTemplates", { id, name: config.name, version: "1", config: JSON.stringify(config), origin: "custom" });
  return NextResponse.json({ template: { id, origin: "custom", version: 1, config } });
}
