import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { capsuleCfg, capsuleRows, isOpened, loadCapsule, saveCapsuleCfg, teams } from "@/lib/capsule";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string; aid: string }> };

// 타임캡슐 설정과 작성 현황(인원 수만). 열림 일시 전에는 관리자도 내용을 볼 수 없다. 이 API에는 내용이 없다.
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadCapsule(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const [cfg, rows, ts] = await Promise.all([capsuleCfg(aid), capsuleRows(aid), teams(aid)]);
  return NextResponse.json({
    openAt: cfg.openAt,
    selfView: cfg.selfView,
    log: cfg.log,
    opened: isOpened(cfg.openAt),
    counts: { goals: rows.filter((r) => r.kind === "goal").length, pacts: rows.filter((r) => r.kind === "pact").length, teams: ts.length },
  });
}

const body = z.object({
  openAt: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/), // 빈 문자열이면 등록 취소
  selfView: z.boolean(),
});

// 열림 일시 등록/변경(변경 기록을 남긴다)과 본인 확인 허용 여부
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard("activities");
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const c = await loadCapsule(aid, id);
  if (typeof c === "string") return bad(c, 404);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("열림 일시는 날짜와 시간을 함께 입력해 주세요.");

  const cfg = await capsuleCfg(aid);
  if (isOpened(cfg.openAt) && parsed.data.openAt !== cfg.openAt) return bad("이미 열린 타임캡슐의 열림 일시는 바꿀 수 없어요.", 409);
  if (parsed.data.openAt !== cfg.openAt) {
    cfg.log = [...cfg.log, { at: new Date().toISOString(), by: g.s.name, from: cfg.openAt, to: parsed.data.openAt }];
  }
  cfg.openAt = parsed.data.openAt;
  cfg.selfView = parsed.data.selfView;
  await saveCapsuleCfg(aid, cfg);
  return NextResponse.json({ ok: true });
}
