"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";

export default function ProfilePage({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = use(params);
  const router = useRouter();
  const [p, setP] = useState<{ alias: string; name: string; introMd: string; mine: boolean } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<NonNullable<typeof p>>(`/api/profiles/${pid}`).then((r) => {
      if (r.ok) setP(r.data);
      else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
  }, [pid, router]);

  return (
    <main className="app">
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => router.push("/profiles")}>‹ 프로필 북</button>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!p && !error && <p className="small">불러오는 중이에요…</p>}
      {p && (
        <>
          <div className="row"><Mascot size={56} /><div><h1 className="title" style={{ fontSize: 26 }}>{p.name || `“${p.alias}”`}</h1>{p.name && <div className="small">별칭 “{p.alias}”</div>}</div></div>
          {p.mine && <span className="pill blue" style={{ alignSelf: "flex-start" }}>내 소개</span>}
          <article className="card" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{p.introMd}</article>
        </>
      )}
    </main>
  );
}
