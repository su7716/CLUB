"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";

type Club = { clubName: string; members: { id: string; name: string }[] };

export default function LoginPage() {
  const router = useRouter();
  const [club, setClub] = useState<Club | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [memberId, setMemberId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/public/club")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Club) => {
        setClub(d);
        setMemberId(d.members[0]?.id ?? "");
      })
      .catch(() => setLoadError(true));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, code }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "로그인하지 못했어요.");
        return;
      }
      router.push("/events");
    } catch {
      setError("연결이 불안정해요. 잠시 후 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <div style={{ paddingTop: 20, display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <Mascot />
        <h1 className="title center" style={{ fontSize: 23 }}>
          {club ? club.clubName : "원우회"}
        </h1>
        <p className="small" style={{ margin: 0 }}>원우회 회원 전용</p>
      </div>

      {loadError && (
        <div className="msg bad" role="alert">
          명단을 불러오지 못했어요. 화면을 새로 고쳐 주세요.
        </div>
      )}
      {!club && !loadError && <p className="small center">불러오는 중이에요…</p>}

      {club && club.members.length === 0 && (
        <div className="msg info">아직 등록된 회원이 없어요. 관리자에게 문의해 주세요.</div>
      )}

      {club && club.members.length > 0 && (
        <form onSubmit={submit} style={{ display: "contents" }}>
          <div>
            <label className="l" htmlFor="nm">이름을 골라 주세요</label>
            <select id="nm" className="field" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              {club.members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="l" htmlFor="cd">초대코드</label>
            <input
              id="cd"
              className="field"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <p className="hint">5회 틀리면 1분간 잠겨요.</p>
          {error && <div className="msg bad" role="alert">{error}</div>}
          <div className="footer-actions">
            <button className="btn" type="submit" disabled={busy || !code}>
              {busy ? "확인 중…" : "들어가기"}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
