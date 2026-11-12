import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { liveView, readConfig } from "@/lib/activities";
import { onsiteGate } from "@/lib/participants";
import { getStore } from "@/lib/store";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), step: z.string().min(1) }), // 사회자가 단계 버튼을 누름 → 회원 화면 켜짐
  z.object({ action: z.literal("lock") }), // 회원 화면을 다시 잠금(예: 투표 마감)
  z.object({ action: z.literal("reset") }), // 현장 진행 처음으로
]);

// 사회자 컨트롤. 어떤 버튼이 있는지, 누르면 회원 화면이 무엇으로 바뀌는지는 모두 템플릿 설정이 정한다.
export async function POST(req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) {
  const g = await guard(["activities", "events"]);
  if ("err" in g) return g.err;
  const { id, aid } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("요청을 확인해 주세요.");

  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && a.eventId === id);
  if (!act) return bad("활동을 찾을 수 없어요.", 404);
  const cfg = readConfig(act.config);
  if (!cfg) return bad("활동 설정을 읽을 수 없어요.", 500);

  const cur = (await s.list("LiveState")).find((l) => l.eventActivityId === aid);
  let step = cur?.step ?? "";
  let unlocked = cur?.memberUnlocked === "true";

  const d = parsed.data;
  if (d.action === "activate") {
    const st = cfg.onsite.steps.find((x) => x.key === d.step);
    if (!st) return bad("없는 단계예요.");
    // 관리자 선택 회원 활동은 활동 전에 출석 체크를 완료해야 시작할 수 있다.
    const gate = await onsiteGate(cfg, act);
    if (gate) return bad(gate, 409);
    step = st.key;
    unlocked = true; // host_click, immediate 모두 이 시점에 켜진다
  } else if (d.action === "lock") {
    if (!step) return bad("진행 중인 단계가 없어요.");
    unlocked = false;
  } else {
    step = "";
    unlocked = false;
  }

  const patch = { step, memberUnlocked: String(unlocked), updatedAt: new Date().toISOString() };
  if (cur) await s.update("LiveState", cur.id, patch);
  else await s.insert("LiveState", { eventActivityId: aid, ...patch });

  return NextResponse.json({ live: liveView(cfg, { step, memberUnlocked: String(unlocked) }) });
}
