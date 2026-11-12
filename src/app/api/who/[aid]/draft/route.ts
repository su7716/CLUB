import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, draftPrompt, isAiEnabled, truthLiesPrompt } from "@/lib/ai";
import { bad, guard, parseJson } from "@/lib/api";
import { findIdentity, generalize, termsFrom } from "@/lib/identity";
import { canJoin } from "@/lib/participants";
import { getStore } from "@/lib/store";
import { guidelinesFor } from "@/lib/ai-guides";
import { loadWho, myInterview, myProfile, myTruthLies, writeClosed, type ChatMsg, type Scope } from "@/lib/who";

type Ctx = { params: Promise<{ aid: string }> };

// 결과 생성(초안). AI가 켜져 있으면 AI가 쓰고, 아니면 '수동 모드'로 내 답변을 모아 초안을 만들어 주고 직접 고치게 한다.
export async function POST(_req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;

  const s = await getStore();
  const profile = await myProfile(g.s.mid);
  if (!profile?.alias) return bad("별칭을 먼저 정해 주세요.");
  if (profile.introStatus === "approved") return bad("승인된 소개가 있어요. 승인을 취소한 뒤 다시 만들 수 있어요.", 409);
  const { row, messages } = await myInterview(g.s.mid, aid);
  if (!row || row.status !== "done") return bad("인터뷰를 끝낸 뒤에 소개 글을 만들 수 있어요.");

  const terms = termsFrom(await s.list("Members"));
  const mine = messages.filter((m) => m.role === "me");
  const introAns = mine.filter((m) => m.scope !== "truthlie" && m.scope !== "none").map((m) => generalize(m.text, terms));
  const tlAns = mine.filter((m) => m.scope === "truthlie").map((m) => generalize(m.text, terms));

  let mode: "ai" | "manual" = "manual";
  let intro = introAns.join("\n\n");
  let statements = [tlAns[0] ?? "", tlAns[1] ?? "", tlAns[2] ?? ""];
  let lieIndex = 0;

  if (isAiEnabled()) {
    const dp = draftPrompt(await guidelinesFor("draft"), introAns);
    const out = await ask(dp.system, dp.messages, 3000);
    if (out) {
      mode = "ai";
      intro = generalize(out, terms);
      const tp = truthLiesPrompt(await guidelinesFor("truthlies"), intro, tlAns);
      const tj = await ask(tp.system, tp.messages, 600);
      const parsed = z.object({ statements: z.array(z.string()).length(3), lieIndex: z.number().int().min(0).max(2) }).safeParse(parseJson(tj ?? "", null));
      if (parsed.success) {
        statements = parsed.data.statements.map((x) => generalize(x, terms));
        lieIndex = parsed.data.lieIndex;
      }
    }
  }

  const now = new Date().toISOString();
  await s.update("Profiles", profile.id, { draftMd: intro, introStatus: "draft", updatedAt: now });
  // 불참하는 분은 활동에 들어가지 않으므로 2진실 1거짓은 만들지 않는다(프로필 북용 소개만).
  const inAct = await canJoin(w.cfg, w.act, w.ev, g.s.mid);
  if (inAct) {
    const tl = await myTruthLies(g.s.mid, aid);
    const tlPatch = { statements: JSON.stringify(statements), lieIndex: String(lieIndex), status: "draft" };
    if (tl) await s.update("TruthLies", tl.id, tlPatch);
    else await s.insert("TruthLies", { memberId: g.s.mid, eventActivityId: aid, ...tlPatch });
  }

  return NextResponse.json({ mode, inActivity: inAct, draftMd: intro, statements: inAct ? statements : [], lieIndex, remaining: findIdentity(intro, terms) });
}

const save = z.object({
  introMd: z.string().max(8000),
  statements: z.array(z.string().max(300)).length(3).optional(),
  lieIndex: z.number().int().min(0).max(2).optional(),
  // 항목(내 답변)별 공개 범위: 소개 페이지에 공개 / 2진실 1거짓용으로만 / 사용 안 함. 키는 메시지 번호.
  scopes: z.record(z.string(), z.enum(["intro", "truthlie", "none"])).optional(),
});

// 직접 고친 내용 저장(승인 전 초안). 초안은 다른 회원과 관리자에게 보이지 않는다.
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;
  const parsed = save.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 거짓 번호는 1~3번 중 하나예요.");
  const d = parsed.data;

  const s = await getStore();
  const profile = await myProfile(g.s.mid);
  if (!profile?.alias) return bad("별칭을 먼저 정해 주세요.");
  if (profile.introStatus === "approved") return bad("승인을 취소한 뒤 고칠 수 있어요.", 409);

  const now = new Date().toISOString();
  await s.update("Profiles", profile.id, { draftMd: d.introMd, introStatus: d.introMd.trim() ? "draft" : "none", updatedAt: now });
  if (d.statements && (await canJoin(w.cfg, w.act, w.ev, g.s.mid))) {
    const tl = await myTruthLies(g.s.mid, aid);
    const tlPatch = { statements: JSON.stringify(d.statements), lieIndex: String(d.lieIndex ?? 0), status: "draft" };
    if (tl) await s.update("TruthLies", tl.id, tlPatch);
    else await s.insert("TruthLies", { memberId: g.s.mid, eventActivityId: aid, ...tlPatch });
  }

  if (d.scopes) {
    const iv = await myInterview(g.s.mid, aid);
    if (iv.row) {
      const msgs: ChatMsg[] = iv.messages.map((m, i) => (m.role === "me" && d.scopes![String(i)] ? { ...m, scope: d.scopes![String(i)] as Scope } : m));
      await s.update("Interviews", iv.row.id, { messages: JSON.stringify(msgs), updatedAt: now });
    }
  }
  return NextResponse.json({ ok: true });
}
