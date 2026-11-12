"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type Team = { id: string; name: string; members: { id: string; name: string; ageGroup: string }[] };
type Data = { teams: Team[]; published: boolean };

// 팀 구성 결과를 큰 화면에 보여 준다.
export default function TeamsScreen({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [published, setPublished] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/admin/events/${id}/activities/${aid}/teams`);
    if (r.ok) {
      setTeams(r.data.teams);
      setPublished(r.data.published);
    }
    else if (r.status === 401 || r.status === 403) setDenied(true);
    else setError(r.error);
  }, [id, aid]);
  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  if (denied) return <div className="host" role="alert"><h1>관리자 확인이 필요해요</h1><Link className="btn" href="/admin" style={{ width: "auto", alignSelf: "flex-start", textDecoration: "none" }}>관리자 화면으로</Link></div>;

  return (
    <div className="host" ref={wrap}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 32 }}>팀 구성</h1>
        {teams && teams.length > 0 && <span className={`pill ${published ? "ok" : "warn"}`}>{published ? "배포됨" : "배포 전 초안"}</span>}
        <span style={{ flex: 1 }} />
        <button className="mini" type="button" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : wrap.current?.requestFullscreen?.())}>전체화면 ⛶</button>
        <Link className="mini" href={`/admin/events/${id}`} style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>관리자로 돌아가기</Link>
      </header>
      {error && <div className="msg bad" role="alert">{error}</div>}
      {!teams && !error && <p className="sub">불러오는 중이에요…</p>}
      {teams && teams.length === 0 && <div className="panel"><h2>아직 팀이 없어요</h2><p className="sub" style={{ margin: 0 }}>관리자 화면의 활동 탭에서 팀을 구성해 주세요.</p></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
        {teams?.map((t) => (
          <div key={t.id} className="panel">
            <h2 style={{ color: "#e5c9a3", fontSize: 40 }}>{t.name}</h2>
            {t.members.map((m) => <div key={m.id} style={{ fontSize: 30 }}>{m.name}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
