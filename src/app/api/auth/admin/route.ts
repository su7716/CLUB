import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, getSession, lockedFor, recordFail, clearFails } from "@/lib/auth";

const body = z.object({ passcode: z.string().min(1).max(128) });

// 관리자 2차 확인. 로그인한 회원 중 관리자 권한이 있는 사람만 통과할 수 있다.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.perms.length === 0) {
    return NextResponse.json({ error: "관리자 권한이 없어요." }, { status: 403 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "비밀번호를 입력해 주세요." }, { status: 400 });

  const key = `admin:${session.mid}`;
  const wait = lockedFor(key);
  if (wait > 0) return NextResponse.json({ error: `잠시 후 다시 시도해 주세요. (${wait}초)` }, { status: 429 });

  const expected = process.env.ADMIN_PASSCODE;
  if (!expected || parsed.data.passcode !== expected) {
    recordFail(key);
    return NextResponse.json({ error: "관리자 비밀번호가 맞지 않아요." }, { status: 401 });
  }
  clearFails(key);
  await createSession({ ...session, admin: true });
  return NextResponse.json({ ok: true });
}
