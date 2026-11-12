import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 작성 현황(인원 수만). 승인 전 초안과 인터뷰 내용은 관리자에게도 보이지 않는다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);

  const [members, profiles, interviews, guesses] = await Promise.all([
    s.list("Members"), s.list("Profiles"), s.list("Interviews"), s.list("Guesses"),
  ]);
  const ids = members.filter((m) => m.kind !== "회원대기").map((m) => m.id);
  const approved = ids.filter((m) => profiles.find((p) => p.memberId === m)?.introStatus === "approved");
  const writing = ids.filter(
    (m) => !approved.includes(m) && (interviews.some((i) => i.memberId === m && i.eventActivityId === aid) || profiles.some((p) => p.memberId === m && p.alias)),
  );
  const guessers = new Set(guesses.filter((x) => x.eventActivityId === aid).map((x) => x.guesserId));
  return NextResponse.json({
    total: ids.length,
    approved: approved.length,
    writing: writing.length,
    notStarted: ids.length - approved.length - writing.length,
    guessers: guessers.size,
  });
}
