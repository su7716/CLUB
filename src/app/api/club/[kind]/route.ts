import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원이 보는 원우회 정보: 조직도(이름과 직책만), 확정된 회칙. 회의록은 관리자만 본다.
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { kind } = await ctx.params;
  const s = await getStore();
  if (kind === "org") {
    const [org, members] = await Promise.all([s.list("Org"), s.list("Members")]);
    const nm = (id: string) => members.find((m) => m.id === id)?.name ?? "";
    return NextResponse.json({
      items: org.map((o) => ({ id: o.id, dept: o.dept, role: o.role, name: nm(o.memberId), clubName: o.clubName, frequency: o.frequency, leader: nm(o.leaderId) })),
    });
  }
  if (kind === "rules") {
    const rules = (await s.list("Rules")).filter((r) => r.confirmed === "true");
    return NextResponse.json({ items: rules.map((r) => ({ id: r.id, chapter: r.chapter, article: r.article, body: r.body, version: r.version })) });
  }
  return bad("볼 수 없는 항목이에요.", 404);
}
