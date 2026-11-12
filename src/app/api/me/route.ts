import { NextResponse } from "next/server";
import { guard, parseJson } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const me = (await s.list("Members")).find((m) => m.id === g.s.mid);
  if (!me) return NextResponse.json({ error: "회원 정보를 찾을 수 없어요." }, { status: 401 });
  const extra = parseJson<{ consentAt?: string }>(me.extra, {});
  return NextResponse.json({
    name: g.s.name,
    perms: g.s.perms,
    admin: g.s.admin,
    consent: Boolean(extra.consentAt),
  });
}
