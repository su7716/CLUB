import { NextResponse } from "next/server";
import { bad, guard, parseJson } from "@/lib/api";
import { getStore } from "@/lib/store";

// 개인정보 공개 동의 (첫 접속 시 1회)
export async function POST() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const me = (await s.list("Members")).find((m) => m.id === g.s.mid);
  if (!me) return bad("회원 정보를 찾을 수 없어요.", 404);
  const extra = parseJson<Record<string, unknown>>(me.extra, {});
  extra.consentAt = new Date().toISOString();
  await s.update("Members", me.id, { extra: JSON.stringify(extra) });
  return NextResponse.json({ ok: true });
}
