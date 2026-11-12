import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { makeTeams } from "@/lib/capsule";
import { gTeams, groupPool, loadGrouping } from "@/lib/groups";
import { getStore } from "@/lib/store";
import type { Row } from "@/lib/store/types";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; gid: string }> };

const view = (m: Row) => ({ id: m.id, name: m.name, ageGroup: m.ageGroup });

// 조편성 보드 데이터. 타임캡슐 팀 구성과 같은 모양이라 같은 화면(TeamBoard)을 쓴다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["events", "activities"]);
  if ("err" in g) return g.err;
  const { id, gid } = await ctx.params;
  const c = await loadGrouping(id, gid);
  if (!c) return bad("조편성을 찾을 수 없어요.", 404);
  const [pool, all] = await Promise.all([groupPool(c.ev), getStore().then((s) => s.list("Members"))]);
  const teams = gTeams(c.g);
  const byId = new Map(all.map((m) => [m.id, m]));
  const assigned = new Set(teams.flatMap((t) => t.memberIds));
  return NextResponse.json({
    poolKind: pool.kind,
    published: c.g.published === "true",
    publishedAt: "",
    locked: false,
    teams: teams.map((t, i) => ({ id: `t${i}`, name: t.name, members: t.memberIds.map((mid) => view(byId.get(mid) ?? { id: mid, name: "(삭제된 회원)", ageGroup: "" })) })),
    unassigned: pool.members.filter((m) => !assigned.has(m.id)).map(view),
    participantCount: pool.members.length,
  });
}

async function save(gid: string, teams: { name: string; memberIds: string[] }[]) {
  // 구성을 바꾸면 다시 '확인'을 눌러야 회원에게 배포된다.
  await (await getStore()).update("Groupings", gid, { teams: JSON.stringify(teams), published: "false", updatedAt: new Date().toISOString() });
}

const gen = z.object({
  mode: z.enum(["random", "mix", "manual"]),
  count: z.number().int().min(1).max(30).optional(),
  size: z.number().int().min(2).max(20).optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(["events", "activities"]);
  if ("err" in g) return g.err;
  const { id, gid } = await ctx.params;
  const c = await loadGrouping(id, gid);
  if (!c) return bad("조편성을 찾을 수 없어요.", 404);
  const parsed = gen.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.count && !parsed.data.size)) return bad("방식을 고르고 조 수나 조당 인원 중 하나를 입력해 주세요.");
  const pool = await groupPool(c.ev);
  if (pool.members.length < 2) return bad("조를 만들 회원이 부족해요.");
  const count = Math.min(pool.members.length, parsed.data.count ?? Math.ceil(pool.members.length / (parsed.data.size as number)));
  const made = makeTeams(pool.members, count, parsed.data.mode);
  await save(gid, made.map((ms, i) => ({ name: `${i + 1}조`, memberIds: ms.map((m) => m.id) })));
  return NextResponse.json({ ok: true, teams: count, mode: parsed.data.mode });
}

const manual = z.object({ teams: z.array(z.object({ name: z.string().trim().min(1).max(20), memberIds: z.array(z.string()).max(60) })).max(40) });

export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(["events", "activities"]);
  if ("err" in g) return g.err;
  const { id, gid } = await ctx.params;
  const c = await loadGrouping(id, gid);
  if (!c) return bad("조편성을 찾을 수 없어요.", 404);
  const parsed = manual.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("조 이름과 구성원을 확인해 주세요.");
  const all = await (await getStore()).list("Members");
  const names = new Set<string>();
  const seen = new Set<string>();
  for (const t of parsed.data.teams) {
    if (names.has(t.name)) return bad("같은 이름의 조가 있어요.");
    names.add(t.name);
    for (const mid of t.memberIds) {
      if (!all.some((m) => m.id === mid)) return bad("명단에 없는 회원이 있어요.");
      if (seen.has(mid)) return bad("한 사람이 두 조에 들어갈 수 없어요.");
      seen.add(mid);
    }
  }
  await save(gid, parsed.data.teams);
  return NextResponse.json({ ok: true });
}
