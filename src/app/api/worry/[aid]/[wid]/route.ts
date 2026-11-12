import { NextResponse } from "next/server";
import { preStatus } from "@/lib/activities";
import { bad, guard } from "@/lib/api";
import { NOT_ATTENDEE, canJoin } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { loadWorry, worryBody, worryRows } from "@/lib/worry";

type Ctx = { params: Promise<{ aid: string; wid: string }> };

// 내 고민 수정/삭제: 작성 기간 안에, 아직 뽑히지 않은 것만.
async function mineOpen(ctx: Ctx, mid: string) {
  const { aid, wid } = await ctx.params;
  const w = await loadWorry(aid);
  if (typeof w === "string") return { err: bad(w, 404) };
  if (!(await canJoin(w.cfg, w.act, w.ev, mid))) return { err: bad(NOT_ATTENDEE, 403) };
  if (preStatus(w.cfg, w.ev.startsAt).status !== "open") return { err: bad("작성 기간이 아니라 고칠 수 없어요.", 403) };
  const row = (await worryRows(aid)).find((x) => x.id === wid && x.memberId === mid);
  if (!row) return { err: bad("고민을 찾을 수 없어요.", 404) };
  if (row.drawnAt) return { err: bad("이미 뽑힌 고민은 고칠 수 없어요.", 409) };
  return { row };
}

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const m = await mineOpen(ctx, g.s.mid);
  if ("err" in m) return m.err;
  const parsed = worryBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("고민은 2~500자로 적고, 카테고리와 익명 여부를 골라 주세요.");
  await (await getStore()).update("Worries", m.row!.id, {
    body: parsed.data.body, category: parsed.data.category, anonymous: String(parsed.data.anonymous), updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const m = await mineOpen(ctx, g.s.mid);
  if ("err" in m) return m.err;
  await (await getStore()).remove("Worries", m.row!.id);
  return NextResponse.json({ ok: true });
}
