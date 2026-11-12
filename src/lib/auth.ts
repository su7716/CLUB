import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE = "session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30일

export type Session = {
  mid: string;
  name: string;
  perms: string[]; // 관리자 권한 목록. 비어 있으면 일반 회원
  admin: boolean; // 관리자 2차 비밀번호까지 통과했는지
};

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET 환경변수가 필요합니다.");
  }
  return new TextEncoder().encode(s ?? "dev-only-secret-change-before-deploy-0123456789");
}

export async function createSession(s: Session): Promise<void> {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      mid: String(payload.mid),
      name: String(payload.name),
      perms: Array.isArray(payload.perms) ? (payload.perms as string[]) : [],
      admin: payload.admin === true,
    };
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// 권한 확인: 'all' 은 모든 권한. 관리자 2차 비밀번호를 통과해야 한다.
export function can(s: Session | null, perm: string): boolean {
  if (!s || !s.admin) return false;
  return s.perms.includes("all") || s.perms.includes(perm);
}

// 로그인 실패 잠금 (5회 연속 실패 시 1분). 서버 메모리 기반이라 인스턴스가 바뀌면 초기화된다.
const fails = new Map<string, { n: number; until: number }>();

export function lockedFor(key: string): number {
  const f = fails.get(key);
  if (!f || f.until <= Date.now()) return 0;
  return Math.ceil((f.until - Date.now()) / 1000);
}

export function recordFail(key: string): void {
  const f = fails.get(key) ?? { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) {
    f.until = Date.now() + 60_000;
    f.n = 0;
  }
  fails.set(key, f);
}

export function clearFails(key: string): void {
  fails.delete(key);
}
