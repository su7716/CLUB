import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

// 프로필 북 실명 공개 시점(한국 시간). 이 시각 이후 별칭 대신 실명으로 보여 준다. 비우면 공개하지 않는다.
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  return NextResponse.json({ revealAt: await getSetting<string>("profileRevealAt", "") });
}

const body = z.object({ revealAt: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/) });

export async function PUT(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("공개 시점은 날짜와 시간을 함께 입력해 주세요.");
  await setSetting("profileRevealAt", parsed.data.revealAt);
  return NextResponse.json({ ok: true });
}
