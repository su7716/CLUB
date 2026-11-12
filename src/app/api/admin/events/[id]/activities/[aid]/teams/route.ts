import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { capsuleRows, loadCapsule, makeTeams, saveTeamsState, teams, teamsState } from "@/lib/capsule";
import { participantPool, rosterSet } from "@/lib/participants";
import { getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; aid: string }> };

// 팀 구성에 쓸 사람: 관리자 선택 회원 활동이면 선택한 회원, 전체 회원 활동이면 행사 참석 신청자(없으면 전체 회원).
const pool = participantPool;

const view = (m: Row) => ({ id: m.id, name: m.name, ageGroup: m.ageGroup });

// 이미 작성된 타임캡슐이 있으면 팀을 바꿀 수 없다(팀 약속이 팀에 묶여 있다).
async function locked(aid: string): Promise<boolean> {
  return (await capsuleRows(aid)).length > 0;
}

export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadCapsule(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const [p, ts, state, lock] = await Promise.all([pool(c.cfg, c.act, c.ev), teams(aid), teamsState(aid), locked(aid)]);
  const byId = new Map(p.members.map((m) => [m.id, m]));
  const all = await (await getStore()).list("Members");
  const assigned = new Set(ts.flatMap((t) => t.memberIds));
  return NextResponse.json({
    poolKind: p.kind,
    published: state.published,
    publishedAt: state.publishedAt,
    locked: lock,
    teams: ts.map((t) => ({ id: t.id, name: t.name, members: t.memberIds.map((mid) => view(byId.get(mid) ?? all.find((m) => m.id === mid) ?? { id: mid, name: "(삭제된 회원)", ageGroup: "" })) })),
    unassigned: p.members.filter((m) => !assigned.has(m.id)).map(view),
    participantCount: p.members.length,
  });
}

const gen = z.object({
  mode: z.enum(["random", "mix", "manual"]),
  count: z.number().int().min(1).max(30).optional(),
  size: z.number().int().min(2).max(20).optional(),
});

async function replaceTeams(aid: string, list: { name: string; memberIds: string[] }[]) {
  const s = await getStore();
  for (const t of await teams(aid)) await s.remove("Teams", t.id);
  for (const t of list) await s.insert("Teams", { eventActivityId: aid, name: t.name, memberIds: JSON.stringify(t.memberIds) });
  // 구성을 바꾸면 다시 '확인'을 눌러야 회원에게 배포된다.
  await saveTeamsState(aid, { published: false, publishedAt: "", by: "" });
}

// 팀 만들기: 관리자 배정(빈 팀), 연령대 섞기, 랜덤 배정. 결과는 초안이고, 확인을 눌러야 배포된다.
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadCapsule(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const parsed = gen.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.count && !parsed.data.size)) return bad("방식을 고르고 팀 수나 팀당 인원 중 하나를 입력해 주세요.");
  if (await locked(aid)) return bad("이미 작성된 타임캡슐이 있어서 팀을 다시 만들 수 없어요.", 409);

  const p = await pool(c.cfg, c.act, c.ev);
  if (p.members.length < 2) return bad("팀을 만들 회원이 부족해요. 활동에 참여할 회원을 먼저 선택해 주세요.");
  const count = Math.min(p.members.length, parsed.data.count ?? Math.ceil(p.members.length / (parsed.data.size as number)));
  const made = makeTeams(p.members, count, parsed.data.mode);
  await replaceTeams(aid, made.map((ms, i) => ({ name: `${i + 1}팀`, memberIds: ms.map((m) => m.id) })));
  return NextResponse.json({ ok: true, teams: count, mode: parsed.data.mode, poolKind: p.kind });
}

const manual = z.object({
  teams: z.array(z.object({ name: z.string().trim().min(1).max(20), memberIds: z.array(z.string()).max(30) })).max(30),
});

// 드래그로 옮긴 결과 저장(초안). 빈 팀도 그대로 둔다. 이름이 같은 팀은 만들 수 없다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadCapsule(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const parsed = manual.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("팀 이름과 구성원을 확인해 주세요.");
  if (await locked(aid)) return bad("이미 작성된 타임캡슐이 있어서 팀을 바꿀 수 없어요.", 409);

  const all = await (await getStore()).list("Members");
  const att = c.cfg.participants === "selected" ? await rosterSet(c.act) : null;
  const names = new Set<string>();
  const seen = new Set<string>();
  for (const t of parsed.data.teams) {
    if (names.has(t.name)) return bad("같은 이름의 팀이 있어요.");
    names.add(t.name);
    for (const mid of t.memberIds) {
      if (!all.some((m) => m.id === mid)) return bad("명단에 없는 회원이 있어요.");
      if (seen.has(mid)) return bad("한 사람이 두 팀에 들어갈 수 없어요.");
      if (att && !att.has(mid)) return bad("이 활동은 관리자가 선택한 회원만 팀에 넣을 수 있어요.");
      seen.add(mid);
    }
  }
  await replaceTeams(aid, parsed.data.teams);
  return NextResponse.json({ ok: true });
}
