import { NextResponse } from "next/server";
import { bad, guard, parseJson } from "@/lib/api";
import { liveView } from "@/lib/activities";
import { currentRound, eligibleTargets, liveRow, loadStage, missingSteps, rounds, type RoundState } from "@/lib/rounds";
import { joinSet } from "@/lib/participants";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 사회자 전체화면이 2초마다 읽는 곳. 이름과 정답은 공개 단계가 되기 전에는 내려주지 않는다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const st = await loadStage(id, aid);
  if (typeof st === "string") return bad(st, 404);

  const s = await getStore();
  const cur = await currentRound(aid);
  const join = await joinSet(st.cfg, st.act, st.ev);
  const [members, profiles, tls, guesses, votes, live, all, pool] = await Promise.all([
    s.list("Members"), s.list("Profiles"), s.list("TruthLies"), s.list("Guesses"), s.list("Votes"),
    liveRow(aid), rounds(aid), eligibleTargets(aid, join),
  ]);
  const nameOf = (mid: string) => members.find((m) => m.id === mid)?.name ?? "";
  const base = {
    event: { id: st.ev.id, name: st.ev.name },
    activity: { id: aid, name: st.cfg.name, participants: st.cfg.participants },
    missingSteps: missingSteps(st.cfg),
    live: liveView(st.cfg, live),
    steps: st.cfg.onsite.steps.map((x) => ({ key: x.key, label: x.label, memberScreen: x.memberScreen, unlock: x.unlock })),
    playedCount: all.filter((r) => r.state === "answer").length,
    remaining: pool.length,
    // 순서를 지정할 때 고를 수 있는 사람(이름만). 누구의 별칭인지는 알려 주지 않는다.
    selectable: pool.map((m) => ({ id: m.id, name: m.name })),
  };
  if (!cur) return NextResponse.json({ ...base, round: null });

  const state = cur.state as RoundState;
  const target = cur.targetMemberId;
  const named = cur.nameRevealed === "true";
  const tl = tls.find((t) => t.memberId === target && t.eventActivityId === aid);
  const lie = tl?.lieIndex ? Number(tl.lieIndex) : 0;
  const rv = votes.filter((v) => v.roundId === cur.id);
  const eligible = members.filter((m) => m.kind !== "회원대기" && m.id !== target && (!join || join.has(m.id)));

  // 사전 추측 결과: 누가 누구를 몇 표로 골랐는지(추측 결과 단계부터)
  let guessResults: { name: string; count: number }[] = [];
  if (state !== "intro") {
    const counts = new Map<string, number>();
    for (const x of guesses) {
      if (x.eventActivityId === aid && x.targetMemberId === target) counts.set(x.chosenMemberId, (counts.get(x.chosenMemberId) ?? 0) + 1);
    }
    guessResults = [...counts.entries()].map(([mid, count]) => ({ name: nameOf(mid), count })).sort((a, b) => b.count - a.count);
  }

  const showStatements = state === "voting" || state === "closed" || state === "answer";
  const counts = [0, 1, 2].map((i) => rv.filter((v) => Number(v.chosenIndex) === i).length);
  return NextResponse.json({
    ...base,
    round: {
      id: cur.id,
      state,
      orderNo: Number(cur.orderNo),
      alias: profiles.find((p) => p.memberId === target)?.alias ?? "",
      introMd: profiles.find((p) => p.memberId === target)?.introMd ?? "",
      nameRevealed: named,
      name: named ? nameOf(target) : "",
      guessResults,
      guessTotal: guessResults.reduce((n, x) => n + x.count, 0),
      statements: showStatements ? parseJson<string[]>(tl?.statements, []) : [],
      votes: { counts, voted: rv.length, eligible: eligible.length },
      lieIndex: state === "answer" ? lie : -1,
      correctVoters: state === "answer" ? rv.filter((v) => Number(v.chosenIndex) === lie).map((v) => nameOf(v.voterId)) : [],
      correctGuessers: state === "answer" ? guesses.filter((x) => x.eventActivityId === aid && x.targetMemberId === target && x.chosenMemberId === target).map((x) => nameOf(x.guesserId)) : [],
    },
  });
}
