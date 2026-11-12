import { NextResponse } from "next/server";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { bad, guard, parseJson } from "@/lib/api";
import { computeScores, liveRow, loadStage, setLive, topOf } from "@/lib/rounds";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; aid: string }> };

type Lottery = { tiedIds: string[]; winnerId: string; drawnAt: string };
type Payload = { lottery?: { A?: Lottery; B?: Lottery } } & Record<string, unknown>;

// 점수판: A) 누구인지 가장 많이 맞힌 사람, B) 거짓을 가장 많이 맞힌 사람. 동점자는 룰렛 대상.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const st = await loadStage(id, aid);
  if (typeof st === "string") return bad(st, 404);
  const sc = await computeScores(aid);
  const payload = parseJson<Payload>((await liveRow(aid))?.payload, {});
  const out = (key: "A" | "B") => {
    const top = topOf(sc[key]);
    const lot = payload.lottery?.[key];
    return {
      top: sc[key].slice(0, 5),
      topScore: top.score,
      tied: top.tied.map((x) => ({ id: x.memberId, name: x.name })),
      needsRoulette: top.tied.length > 1,
      lottery: lot ? { ...lot, winnerName: sc[key].find((x) => x.memberId === lot.winnerId)?.name ?? "" } : null,
    };
  };
  return NextResponse.json({ played: sc.played, A: out("A"), B: out("B") });
}

const body = z.object({ category: z.enum(["A", "B"]), redo: z.boolean().optional() });

// 동점자 룰렛: 동점자만으로 추첨한다. 결과는 서버가 정해서 저장하므로 화면을 새로 고쳐도 같다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const st = await loadStage(id, aid);
  if (typeof st === "string") return bad(st, 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");
  const { category, redo } = parsed.data;

  const sc = await computeScores(aid);
  const top = topOf(sc[category]);
  if (top.tied.length < 2) return bad("동점자가 없어서 룰렛이 필요 없어요.");

  const row = await liveRow(aid);
  const payload = parseJson<Payload>(row?.payload, {});
  const prev = payload.lottery?.[category];
  if (prev && !redo) return bad("이미 룰렛을 돌렸어요. 다시 돌리려면 다시 돌리기를 눌러 주세요.", 409);

  const winner = top.tied[randomInt(top.tied.length)];
  const lot: Lottery = { tiedIds: top.tied.map((x) => x.memberId), winnerId: winner.memberId, drawnAt: new Date().toISOString() };
  payload.lottery = { ...payload.lottery, [category]: lot };
  await setLive(aid, null, row?.memberUnlocked === "true", payload);
  return NextResponse.json({ tied: top.tied.map((x) => ({ id: x.memberId, name: x.name })), winnerId: winner.memberId, winnerName: winner.name });
}
