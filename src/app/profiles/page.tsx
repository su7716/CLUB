"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Data = {
  revealed: boolean; revealAt: string;
  items: { id: string; alias: string; name: string; mine: boolean }[];
  missingCount: number; missing: { name: string }[];
};

// 회원 프로필 북: 공개로 승인된 소개만 보인다. 공개 시점 전에는 별칭, 이후에는 실명.
export default function ProfilesPage() {
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Data>("/api/profiles").then((r) => {
      if (r.ok) setD(r.data);
      else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
  }, [router]);

  return (
    <main className="app">
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => router.push("/events")}>‹ 행사 목록</button>
      <h1 className="title">회원 프로필 북</h1>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!d && !error && <p className="small">불러오는 중이에요…</p>}
      {d && (
        <>
          <p className="small" style={{ margin: 0 }}>
            {d.revealed ? "회원이 공개로 승인한 소개를 실명으로 보여 드려요." : `회원이 공개로 승인한 소개예요. 지금은 별칭으로만 보여요${d.revealAt ? ` (${d.revealAt.replace("T", " ")}부터 실명)` : ""}.`}
          </p>
          {d.items.length === 0 && <div className="msg info">아직 공개된 소개가 없어요. 회원이 작성하고 배포하면 여기에 나타나요.</div>}
          <div className="pick">
            {d.items.map((p) => (
              <button key={p.id} type="button" className="opt" onClick={() => router.push(`/profiles/${p.id}`)}>
                <span className="name">{d.revealed && p.name ? p.name : `“${p.alias}”`}</span>
                {d.revealed && p.name && <span className="small">별칭 “{p.alias}”</span>}
                {p.mine && <span className="pill blue">내 소개</span>}
              </button>
            ))}
          </div>
          {d.revealed ? (
            d.missing.length > 0 && <div className="card"><b>미작성</b><div className="small">{d.missing.map((m) => m.name).join(", ")}</div></div>
          ) : (
            d.missingCount > 0 && <p className="hint">아직 작성하지 않은 회원이 {d.missingCount}명 있어요.</p>
          )}
        </>
      )}
    </main>
  );
}
