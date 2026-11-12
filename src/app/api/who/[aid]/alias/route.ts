import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { findIdentity, termsFrom } from "@/lib/identity";
import { getStore } from "@/lib/store";
import { loadWho, myProfile, normAlias, writeClosed } from "@/lib/who";

const body = z.object({ alias: z.string().trim().min(2).max(20) });

// 별칭 정하기: 이름·회사명이 드러나면 안 되고, 다른 회원과 겹치면 안 된다.
export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("별칭은 2~20자로 적어 주세요.");
  const alias = parsed.data.alias;

  const s = await getStore();
  const members = await s.list("Members");
  const hits = findIdentity(alias, termsFrom(members));
  if (hits.length > 0) return bad("이름, 회사명, 직함은 별칭에 쓸 수 없어요. 다른 별칭을 정해 주세요.");

  const profiles = await s.list("Profiles");
  if (profiles.some((p) => p.memberId !== g.s.mid && normAlias(p.alias) === normAlias(alias))) {
    return bad("다른 회원이 이미 쓰는 별칭이에요. 다른 별칭을 정해 주세요.");
  }

  const mine = await myProfile(g.s.mid);
  if (mine?.introStatus === "approved") return bad("승인된 소개가 있어요. 승인을 취소한 뒤 바꿀 수 있어요.", 409);
  const now = new Date().toISOString();
  if (mine) await s.update("Profiles", mine.id, { alias, updatedAt: now });
  else await s.insert("Profiles", { memberId: g.s.mid, alias, introStatus: "none", updatedAt: now });
  return NextResponse.json({ ok: true, alias });
}
