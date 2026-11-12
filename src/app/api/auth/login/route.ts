import { NextResponse } from "next/server";
import { z } from "zod";
import { clearFails, createSession, lockedFor, recordFail } from "@/lib/auth";
import { getSetting, getStore } from "@/lib/store";

const body = z.object({ memberId: z.string().min(1), code: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "이름과 초대코드를 입력해 주세요." }, { status: 400 });
  const { memberId, code } = parsed.data;

  const wait = lockedFor(memberId);
  if (wait > 0) {
    return NextResponse.json({ error: `잠시 후 다시 시도해 주세요. (${wait}초)` }, { status: 429 });
  }

  const s = await getStore();
  const member = (await s.list("Members")).find((m) => m.id === memberId);
  const invite = await getSetting("inviteCode", process.env.INVITE_CODE ?? "");
  if (!member || code !== String(invite)) {
    recordFail(memberId);
    return NextResponse.json({ error: "초대코드가 맞지 않아요. 다시 확인해 주세요." }, { status: 401 });
  }

  clearFails(memberId);
  const perms = member.perms ? member.perms.split("|").filter(Boolean) : [];
  await createSession({ mid: member.id, name: member.name, perms, admin: false });
  return NextResponse.json({ ok: true, name: member.name, isAdmin: perms.length > 0 });
}
