import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { getSetting, setSetting } from "@/lib/store";

export const dynamic = "force-dynamic";

const body = z.object({
  clubName: z.string().trim().min(1).max(80),
  clubShortName: z.string().trim().max(40).default(""),
  inviteCode: z.string().trim().min(4).max(32),
  memberKinds: z
    .array(z.object({ value: z.string().trim().min(1).max(30), definition: z.string().max(300).default("") }))
    .min(1)
    .max(20),
});

// 원우회 이름, 초대코드, 회원구분 값과 정의. 모두 관리자가 바꿀 수 있다.
export async function GET() {
  const g = await guard("members");
  if ("err" in g) return g.err;
  return NextResponse.json({
    clubName: await getSetting("clubName", ""),
    clubShortName: await getSetting("clubShortName", ""),
    inviteCode: await getSetting("inviteCode", ""),
    memberKinds: await getSetting("memberKinds", []),
  });
}

export async function PUT(req: Request) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요. 초대코드는 4자 이상이에요.");
  const d = parsed.data;
  await setSetting("clubName", d.clubName);
  await setSetting("clubShortName", d.clubShortName);
  await setSetting("inviteCode", d.inviteCode);
  await setSetting("memberKinds", d.memberKinds);
  return NextResponse.json({ ok: true });
}
