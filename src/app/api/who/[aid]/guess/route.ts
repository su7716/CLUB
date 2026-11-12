import { NextResponse } from "next/server";
import { z } from "zod";
import { guessStatus } from "@/lib/activities";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";
import { NOT_ATTENDEE, joinSet } from "@/lib/participants";
import { guessClosed, loadWho } from "@/lib/who";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ aid: string }> };

const tripText = (days: string): string => {
  const ds = days.split(",").filter(Boolean).map((d) => Number(d.slice(8, 10)));
  if (ds.length === 0) return "";
  return ds.length === 1 ? `${ds[0]}일` : `${ds[0]}~${ds[ds.length - 1]}일`;
};

// 사전 추측 목록: 승인된 소개만, 별칭으로만 보여 준다. 본인 글은 제외한다.
// 응답의 profileId 는 프로필 번호일 뿐이라 누구의 글인지는 알 수 없다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const gs = guessStatus(w.cfg, w.ev.startsAt);
  if (gs.status === "before" || gs.status === "none" || gs.status === "unknown") {
    return NextResponse.json({ guess: gs, targets: [], candidates: [] });
  }

  // 이 활동의 참석자만 맞히기에 참여하고, 참석자의 소개만 노출된다. 불참하는 분의 소개는 프로필 북에만 실린다.
  const join = await joinSet(w.cfg, w.act, w.ev);
  if (join && !join.has(g.s.mid)) {
    return NextResponse.json({ guess: gs, targets: [], candidates: [], notJoin: true });
  }

  const s = await getStore();
  const [profiles, guesses, members, applies] = await Promise.all([
    s.list("Profiles"), s.list("Guesses"), s.list("Members"), s.list("EventApplies"),
  ]);
  const mine = guesses.filter((x) => x.eventActivityId === aid && x.guesserId === g.s.mid);

  const targets = profiles
    .filter((p) => p.introStatus === "approved" && p.memberId !== g.s.mid && (!join || join.has(p.memberId)))
    .map((p) => ({
      profileId: p.id,
      alias: p.alias,
      introMd: p.introMd,
      myChoice: mine.find((x) => x.targetMemberId === p.memberId)?.chosenMemberId ?? "",
    }))
    .sort((a, b) => a.alias.localeCompare(b.alias, "ko"));

  // 후보: 회원 명단. 졸업여행(워크숍) 참석자에게는 라벨과 날짜를 붙인다.
  const isTrip = w.ev.type === "워크숍";
  const candidates = members
    .filter((m) => m.kind !== "회원대기" && m.id !== g.s.mid && (!join || join.has(m.id)))
    .map((m) => {
      const a = applies.find((x) => x.eventId === w.ev.id && x.memberId === m.id && x.answer === "참석");
      return { id: m.id, name: m.name, trip: isTrip && a ? `졸업여행 참석자 · ${tripText(a.days)}`.replace(/ · $/, "") : "" };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return NextResponse.json({ guess: gs, targets, candidates });
}

const body = z.object({ profileId: z.string().min(1), chosenMemberId: z.string().min(1) });

// 한 번의 클릭으로 추측. 마감 전까지 바꿀 수 있다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = guessClosed(w);
  if (closed) return closed;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");

  const join = await joinSet(w.cfg, w.act, w.ev);
  if (join && !join.has(g.s.mid)) return bad(NOT_ATTENDEE, 403);

  const s = await getStore();
  const target = (await s.list("Profiles")).find((p) => p.id === parsed.data.profileId && p.introStatus === "approved" && (!join || join.has(p.memberId)));
  if (!target) return bad("소개글을 찾을 수 없어요.", 404);
  if (target.memberId === g.s.mid) return bad("내 글에는 추측할 수 없어요.");
  const chosen = (await s.list("Members")).find((m) => m.id === parsed.data.chosenMemberId && m.kind !== "회원대기");
  if (!chosen || (join && !join.has(chosen.id))) return bad("명단에 없는 회원이에요.");
  if (chosen.id === g.s.mid) return bad("나 자신은 고를 수 없어요.");

  const cur = (await s.list("Guesses")).find(
    (x) => x.eventActivityId === aid && x.guesserId === g.s.mid && x.targetMemberId === target.memberId,
  );
  if (cur) await s.update("Guesses", cur.id, { chosenMemberId: chosen.id, createdAt: new Date().toISOString() });
  else await s.insert("Guesses", { eventActivityId: aid, guesserId: g.s.mid, targetMemberId: target.memberId, chosenMemberId: chosen.id, createdAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
