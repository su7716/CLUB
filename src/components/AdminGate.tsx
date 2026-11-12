"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Me = { name: string; perms: string[]; admin: boolean; consent: boolean };

// 관리자 화면 공통 틀: 로그인 확인 → 관리자 2차 비밀번호 → 권한 확인 → 위쪽 메뉴.
// mode: 회원관리 / 행사진행 중 어느 쪽 화면인지. need: 필요한 권한(하나라도 있으면 통과).
export function AdminGate(props: {
  mode?: "members" | "events";
  need?: string[];
  active?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadMe() {
    const r = await api<Me>("/api/me");
    if (r.ok) setMe(r.data);
    else if (r.status === 401) router.replace("/");
    else setError(r.error);
  }
  useEffect(() => {
    loadMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await api("/api/auth/admin", { body: { passcode: code } });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setCode("");
    await loadMe();
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.push("/");
  }

  if (!me) {
    return <main className="app admin">{error ? <div className="msg bad" role="alert">{error}</div> : <p className="small">불러오는 중이에요…</p>}</main>;
  }

  if (me.perms.length === 0) {
    return (
      <main className="app admin">
        <div className="msg bad" role="alert">관리자 권한이 없는 계정이에요.</div>
        <button className="btn white" type="button" onClick={() => router.push("/events")}>회원 화면으로</button>
      </main>
    );
  }

  if (!me.admin) {
    return (
      <main className="app">
        <h1 className="title">관리자 확인</h1>
        <p className="small" style={{ margin: 0 }}>{me.name} 님, 관리자 비밀번호를 한 번 더 입력해 주세요.</p>
        <form onSubmit={unlock} style={{ display: "contents" }}>
          <div>
            <label className="l" htmlFor="pc">관리자 비밀번호</label>
            <input id="pc" className="field" type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          {error && <div className="msg bad" role="alert">{error}</div>}
          <div className="footer-actions">
            <button className="btn" type="submit" disabled={busy || !code}>{busy ? "확인 중…" : "확인"}</button>
            <button className="btn white" type="button" onClick={() => router.push("/events")}>회원 화면으로</button>
          </div>
        </form>
      </main>
    );
  }

  const need = props.need ?? [];
  const allowed = need.length === 0 || me.perms.includes("all") || need.some((p) => me.perms.includes(p));

  const sub =
    props.mode === "members"
      ? [{ href: "/admin/members", label: "회원 명단" }, { href: "/admin/settings", label: "원우회 설정" }, { href: "/admin/club", label: "조직도·회칙·회의록" }, { href: "/admin/export", label: "내보내기" }]
      : props.mode === "events"
        ? [{ href: "/admin/events", label: "행사 목록" }, { href: "/admin/templates", label: "활동 템플릿" }, { href: "/admin/ai", label: "AI 지침과 질문" }]
        : [];

  return (
    <main className="app admin">
      <div className="row" style={{ flexWrap: "wrap" }}>
        <nav className="modes" aria-label="관리자 구분">
          <Link href="/admin/members" className={props.mode === "members" ? "on" : ""}>회원관리</Link>
          <Link href="/admin/events" className={props.mode === "events" ? "on" : ""}>행사진행</Link>
        </nav>
        <span className="grow" />
        <span className="pill blue">{me.name} · 관리자</span>
        <button className="mini" type="button" onClick={() => router.push("/events")}>회원 화면</button>
        <button className="mini" type="button" onClick={logout}>로그아웃</button>
      </div>
      {sub.length > 0 && (
        <nav className="subnav" aria-label="하위 메뉴">
          {sub.map((s) => <Link key={s.href} href={s.href} className={props.active === s.href ? "on" : ""}>{s.label}</Link>)}
        </nav>
      )}
      {allowed ? props.children : <div className="msg bad" role="alert">이 화면을 볼 권한이 없어요.</div>}
    </main>
  );
}

export const PERM_LABELS: Record<string, string> = {
  all: "모든 권한",
  members: "회원정보",
  events: "행사",
  fees: "회비·비용",
  activities: "활동·조편성",
  minutes: "회의록·회칙",
};
