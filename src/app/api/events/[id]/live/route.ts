import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { activityKind, guessStatus, liveView, preStatus, readConfig } from "@/lib/activities";
import { canJoin } from "@/lib/participants";
import { memberWorry } from "@/lib/worry";
import { memberRound } from "@/lib/rounds";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원 화면이 2초마다 부르는 곳: 활동별 사전 작성 상태와 현장 진행 상태.
// 이 응답에는 활동 내용(소개글, 정답 등)을 넣지 않는다. 어떤 화면을 켤지만 알려준다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, acts, lives] = await Promise.all([s.list("Events"), s.list("EventActivities"), s.list("LiveState")]);
  const ev = events.find((e) => e.id === id && e.published === "true");
  if (!ev) return bad("행사를 찾을 수 없어요.", 404);

  const mine = acts
    .filter((a) => a.eventId === id)
    .sort((a, b) => Number(a.order) - Number(b.order))
    .flatMap((a) => {
      const cfg = readConfig(a.config);
      return cfg ? [{ a, cfg }] : [];
    });
  const activities = await Promise.all(
    mine.map(async ({ a, cfg }) => ({
      id: a.id,
      name: cfg.name,
      description: cfg.description,
      pre: preStatus(cfg, ev.startsAt),
      guess: guessStatus(cfg, ev.startsAt),
      kind: activityKind(cfg),
      participants: cfg.participants,
      canJoin: await canJoin(cfg, a, ev, g.s.mid),
      startsAt: a.startsAt, // 활동 날짜와 진행 시간(안내용)
      endsAt: a.endsAt,
      live: liveView(cfg, lives.find((l) => l.eventActivityId === a.id)),
      // 현장 진행 중인 사람(라운드): 내가 보는 화면만. 정답은 공개 단계 전에는 포함하지 않는다.
      round: activityKind(cfg) === "who" ? await memberRound(a, ev, g.s.mid, cfg) : null,
      worry: activityKind(cfg) === "worry" ? await memberWorry(a, ev, g.s.mid, cfg) : null,
    })),
  );
  return NextResponse.json({ activities });
}
