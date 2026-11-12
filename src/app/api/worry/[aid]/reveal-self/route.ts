import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { getStore } from "@/lib/store";
import { loadWorry, readPayload, worryRows } from "@/lib/worry";

// 익명으로 적은 작성자가 원하면 이름 오픈 뒤에 본인이 직접 밝힐 수 있다.
export async function POST(_req: Request, ctx: { params: Promise<{ aid: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { aid } = await ctx.params;
  const w = await loadWorry(aid);
  if (typeof w === "string") return bad(w, 404);
  const cur = (await readPayload(aid)).worry;
  const row = cur ? (await worryRows(aid)).find((x) => x.id === cur.currentId) : undefined;
  if (!row || row.memberId !== g.s.mid) return bad("내 고민이 진행 중일 때만 밝힐 수 있어요.", 403);
  if (row.anonymous !== "true") return bad("실명으로 적은 고민이에요.");
  if (row.nameRevealed !== "true") return bad("이름 오픈 뒤에 밝힐 수 있어요.", 409);
  await (await getStore()).update("Worries", row.id, { authorShown: "true" });
  return NextResponse.json({ ok: true });
}
