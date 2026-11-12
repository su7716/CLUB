import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { getSetting, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 프로필 한 장: 공개로 승인된 소개 글만 내려준다.
export async function GET(_req: Request, ctx: { params: Promise<{ pid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { pid } = await ctx.params;
  const s = await getStore();
  const p = (await s.list("Profiles")).find((x) => x.id === pid && x.introStatus === "approved");
  if (!p) return bad("프로필을 찾을 수 없어요.", 404);
  const revealAt = await getSetting<string>("profileRevealAt", "");
  const revealed = revealAt !== "" && Date.now() >= Date.parse(`${revealAt}:00+09:00`);
  const name = revealed ? (await s.list("Members")).find((m) => m.id === p.memberId)?.name ?? "" : "";
  return NextResponse.json({ alias: p.alias, name, introMd: p.introMd, mine: p.memberId === g.s.mid });
}
