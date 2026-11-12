import { NextResponse } from "next/server";
import { guard, parseJson } from "@/lib/api";
import { isAiEnabled } from "@/lib/ai";
import { canJoin } from "@/lib/participants";
import { interviewView, loadWho, myInterview, myProfile, myTruthLies, questions, windows } from "@/lib/who";

export const dynamic = "force-dynamic";

// 내 소개 작성 현황. 본인 것만 내려준다(인터뷰 원문 포함, 다른 회원에게는 절대 노출하지 않는다).
export async function GET(_req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;

  const [profile, iv, tl, qs] = await Promise.all([myProfile(g.s.mid), myInterview(g.s.mid, aid), myTruthLies(g.s.mid, aid), questions()]);
  return NextResponse.json({
    activity: { id: aid, name: w.cfg.name },
    event: { id: w.ev.id, name: w.ev.name },
    ...windows(w),
    aiEnabled: isAiEnabled(),
    // 이 활동에 참석하는지. 불참하는 분은 활동(2진실 1거짓, 맞히기)에는 들어가지 않고 프로필 북용 소개만 작성한다.
    inActivity: await canJoin(w.cfg, w.act, w.ev, g.s.mid),
    participants: w.cfg.participants,
    profile: {
      alias: profile?.alias ?? "",
      draftMd: profile?.draftMd ?? "",
      introMd: profile?.introMd ?? "",
      introStatus: profile?.introStatus || "none",
    },
    interview: interviewView(iv.messages, iv.row?.status ?? "", qs.length),
    truthLies: {
      statements: parseJson<string[]>(tl?.statements, ["", "", ""]),
      lieIndex: tl?.lieIndex ? Number(tl.lieIndex) : 0,
      status: tl?.status || "none",
    },
  });
}
