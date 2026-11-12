import { NextResponse } from "next/server";
import { z } from "zod";
import { ask, followUpPrompt, isAiEnabled } from "@/lib/ai";
import { guidelinesFor } from "@/lib/ai-guides";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";
import {
  followUpMax, interviewView, loadWho, myInterview, myProfile, questions, writeClosed, type ChatMsg,
} from "@/lib/who";

const body = z.object({ answer: z.string().trim().min(1).max(2000).optional() });

// 인터뷰 진행. 필수 질문(관리자가 편집)을 차례로 묻고, AI가 켜져 있으면 후속 질문을 최대 N개까지 이어서 묻는다.
// 답을 보내면 저장되므로 중간에 나갔다가 이어서 쓸 수 있다.
export async function POST(req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWho(aid);
  if (w instanceof NextResponse) return w;
  const closed = writeClosed(w);
  if (closed) return closed;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("답변은 2000자까지 쓸 수 있어요.");

  if (!(await myProfile(g.s.mid))?.alias) return bad("별칭을 먼저 정해 주세요.");

  const s = await getStore();
  const qs = await questions();
  const max = await followUpMax();
  let { row, messages } = await myInterview(g.s.mid, aid);
  if (row?.status === "done") return bad("인터뷰가 끝났어요. 소개 글 만들기로 넘어가 주세요.", 409);

  const answered = () => messages.filter((m) => m.role === "me").length;

  // 답 없이 다시 열었을 때(이어쓰기): 이미 질문이 있으면 그대로 돌려준다.
  if (!parsed.data.answer && messages.length > 0) {
    return NextResponse.json({ interview: interviewView(messages, row?.status ?? "active", qs.length) });
  }

  if (parsed.data.answer) {
    if (messages.length === 0 || messages[messages.length - 1].role !== "ai") return bad("먼저 질문을 받아 주세요.");
    messages = [...messages, { role: "me", text: parsed.data.answer, scope: "intro" } as ChatMsg];
  }

  // 다음 질문 정하기
  let done = false;
  const n = answered();
  if (n < qs.length) {
    messages = [...messages, { role: "ai", text: qs[n] }];
  } else if (isAiEnabled() && n - qs.length < max) {
    const qa = messages.reduce<{ q: string; a: string }[]>((acc, m, i) => {
      if (m.role === "me" && messages[i - 1]?.role === "ai") acc.push({ q: messages[i - 1].text, a: m.text });
      return acc;
    }, []);
    const p = followUpPrompt(await guidelinesFor("followup"), qa);
    const next = await ask(p.system, p.messages, 200);
    if (!next || next.replace(/[\s."]/g, "") === "없음") done = true;
    else messages = [...messages, { role: "ai", text: next }];
  } else {
    done = true;
  }

  const patch = { messages: JSON.stringify(messages), status: done ? "done" : "active", updatedAt: new Date().toISOString() };
  if (row) await s.update("Interviews", row.id, patch);
  else row = await s.insert("Interviews", { memberId: g.s.mid, eventActivityId: aid, ...patch });
  return NextResponse.json({ interview: interviewView(messages, patch.status, qs.length) });
}
