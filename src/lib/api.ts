import { NextResponse } from "next/server";
import { can, getSession, type Session } from "./auth";

type Guard = { s: Session } | { err: NextResponse };

// 로그인 확인. perm 을 주면 관리자 2차 인증과 해당 권한까지 확인한다.
// 여러 권한 중 하나만 있어도 되면 perm 에 배열을 준다.
export async function guard(perm?: string | string[]): Promise<Guard> {
  const s = await getSession();
  if (!s) return { err: NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  if (perm) {
    const list = Array.isArray(perm) ? perm : [perm];
    if (!list.some((p) => can(s, p))) {
      return { err: NextResponse.json({ error: "이 작업을 할 권한이 없어요." }, { status: 403 }) };
    }
  }
  return { s };
}

export function bad(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function parseJson<T>(text: string | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export const ADMIN_PERMS = ["all", "members", "events", "fees", "activities", "minutes"] as const;
export const MAX_ADMINS = 5;
