"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

type Org = { id: string; dept: string; role: string; name: string; clubName: string; frequency: string; leader: string };
type Rule = { id: string; chapter: string; article: string; body: string; version: string };

// 원우회 정보: 조직도와 확정된 회칙(읽기만 가능)
export default function ClubPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Org[] | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [tab, setTab] = useState<"org" | "rules">("org");

  useEffect(() => {
    api<{ items: Org[] }>("/api/club/org").then((r) => {
      if (r.ok) setOrg(r.data.items);
      else if (r.status === 401) router.replace("/");
    });
    api<{ items: Rule[] }>("/api/club/rules").then((r) => r.ok && setRules(r.data.items));
  }, [router]);

  const groups = new Map<string, Org[]>();
  (org ?? []).filter((o) => !o.clubName).forEach((o) => groups.set(o.dept, [...(groups.get(o.dept) ?? []), o]));
  const clubs = (org ?? []).filter((o) => o.clubName);

  return (
    <main className="app">
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => router.push("/events")}>‹ 행사 목록</button>
      <h1 className="title">원우회 정보</h1>
      <div className="subnav" role="tablist" aria-label="원우회 정보">
        <a href="#" role="tab" aria-selected={tab === "org"} className={tab === "org" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("org"); }}>조직도</a>
        <a href="#" role="tab" aria-selected={tab === "rules"} className={tab === "rules" ? "on" : ""} onClick={(e) => { e.preventDefault(); setTab("rules"); }}>회칙</a>
      </div>

      {tab === "org" && (
        <>
          {!org && <p className="small">불러오는 중이에요…</p>}
          {org && org.length === 0 && <div className="msg info">아직 등록된 조직도가 없어요.</div>}
          {[...groups.entries()].map(([dept, rows]) => (
            <div key={dept} className="card"><b>{dept}</b>{rows.map((r) => <div key={r.id} className="small">{r.role ? `${r.role} · ` : ""}{r.name || "(미정)"}</div>)}</div>
          ))}
          {clubs.length > 0 && (
            <div className="card"><b>소모임</b>
              {clubs.map((c) => <div key={c.id} className="small">{c.clubName}{c.leader ? ` · 리더 ${c.leader}` : " · 리더 선정 예정"}{c.frequency ? ` · ${c.frequency}` : ""}</div>)}
            </div>
          )}
        </>
      )}

      {tab === "rules" && (
        <>
          {!rules && <p className="small">불러오는 중이에요…</p>}
          {rules && rules.length === 0 && <div className="msg info">확정된 회칙이 아직 없어요.</div>}
          {rules?.map((r) => (
            <div key={r.id} className="card"><b>{r.chapter}{r.article ? ` · ${r.article}` : ""}</b><p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{r.body}</p></div>
          ))}
        </>
      )}
    </main>
  );
}
