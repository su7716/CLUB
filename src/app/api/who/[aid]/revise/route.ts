import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, isAiEnabled, revisePrompt } from "@/lib/ai";
import { bad, guard } from "@/lib/api";
import { findIdentity, generalize, revisionRuleCheck, termsFrom } from "@/lib/identity";
import { getStore } from "@/lib/store";
import { guidelinesFor } from "@/lib/ai-guides";
import { loadWho, writeClosed } from "@/lib/who";

const body = z.object({ request: z.string().trim().min(1).max(500), introMd: z.string().min(1).max(8000) });

const REFUSE = "관리자 지침에 맞지 않아 반영할 수 없습니다.";

// 수정 요청: 먼저 규칙으로 지침 위반을 걸러내고(AI 없이도 동작), 통과하면 AI가 고친다.
// 거절되면 글은 바뀌지 않는다. AI가 연결되지 않았으면 직접 고치도록 안내한다.
export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("수정 요청을 입력해 주세요.");

  const terms = termsFrom(await (await getStore()).list("Members"));
  const rule = revisionRuleCheck(parsed.data.request, terms);
  if (rule) return NextResponse.json({ refused: true, error: `${REFUSE} 이유: ${rule}` }, { status: 422 });

  if (!isAiEnabled()) {
    return NextResponse.json({ manual: true, error: "AI가 아직 연결되지 않았어요. 글을 직접 고쳐 주세요." }, { status: 503 });
  }
  const p = revisePrompt(await guidelinesFor("revise"), parsed.data.introMd, parsed.data.request);
  const out = await ask(p.system, p.messages, 3000);
  if (!out) return NextResponse.json({ manual: true, error: "AI가 응답하지 않았어요. 글을 직접 고쳐 주세요." }, { status: 503 });
  if (out.startsWith("거절:")) {
    return NextResponse.json({ refused: true, error: `${REFUSE} 이유: ${out.slice(3).trim()}` }, { status: 422 });
  }
  let text = generalize(out, terms);
  if (findIdentity(text, terms).length > 0) {
    return NextResponse.json({ refused: true, error: `${REFUSE} 이유: 고친 글에 신원이 드러나는 정보가 있어요.` }, { status: 422 });
  }
  return NextResponse.json({ introMd: text });
}
