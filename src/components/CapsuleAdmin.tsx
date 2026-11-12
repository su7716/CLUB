"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { TeamBoard } from "./TeamBoard";

type Cfg = { openAt: string; selfView: boolean; log: { at: string; by: string; from: string; to: string }[]; opened: boolean; counts: { goals: number; pacts: number; teams: number } };

// 타임캡슐 관리: 팀 구성(TeamBoard), 열림 일시 등록, 본인 확인 허용 여부.
// 열림 일시 전에는 관리자도 작성 내용을 볼 수 없다(이 화면에는 인원 수만 나온다).
export function CapsuleAdmin({ eventId, aid, canEdit }: { eventId: string; aid: string; canEdit: boolean }) {
  const base = `/api/admin/events/${eventId}/activities/${aid}`;
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [openAt, setOpenAt] = useState("");
  const [selfView, setSelfView] = useState(false);

  const load = useCallback(async () => {
    const c = await api<Cfg>(`${base}/capsule`);
    if (c.ok) {
      setCfg(c.data);
      setOpenAt(c.data.openAt);
      setSelfView(c.data.selfView);
    } else setMsg({ tone: "bad", text: c.error });
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);

  async function saveOpen() {
    const r = await api(`${base}/capsule`, { method: "PUT", body: { openAt, selfView } });
    setMsg(r.ok ? { tone: "info", text: openAt ? "열림 일시를 저장했어요. 변경 기록이 남아요." : "열림 일시를 지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  if (!cfg) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  return (
    <div style={{ borderTop: "2px solid var(--line)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
      <TeamBoard base={base} canEdit={canEdit} unit="팀" screenHref={`/host/teams/${eventId}/${aid}`} />

      <b style={{ font: "400 18px var(--display)" }}>봉인과 열림</b>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <span className={`pill ${cfg.opened ? "ok" : "gray"}`}>{cfg.opened ? "열렸어요" : cfg.openAt ? "봉인 중" : "열림 일시 미등록"}</span>
        <span className="pill blue">개인 목표 {cfg.counts.goals}명 작성</span>
        <span className="pill blue">팀 약속 {cfg.counts.pacts}팀 작성</span>
      </div>
      <span className="small">열림 일시 전에는 관리자도 내용을 볼 수 없고, 서버가 회원에게도 내용을 내려주지 않아요. 내년 송년회 일정이 정해지면 열림 일시를 등록해 주세요(한국 시간).</span>
      {canEdit && (
        <div className="grid2">
          <div><label className="l" htmlFor={`oa-${aid}`}>열림 일시</label><input id={`oa-${aid}`} className="field" type="datetime-local" value={openAt} disabled={cfg.opened} onChange={(e) => setOpenAt(e.target.value)} /></div>
          <div className="checks" style={{ alignSelf: "end" }}>
            <label><input type="checkbox" checked={selfView} disabled={cfg.opened} onChange={(e) => setSelfView(e.target.checked)} />작성 직후 본인이 자기 목표를 볼 수 있게 하기</label>
          </div>
        </div>
      )}
      {canEdit && <button className="btn" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 48, fontSize: 17 }} disabled={cfg.opened} onClick={saveOpen}>열림 설정 저장</button>}
      {cfg.log.length > 0 && (
        <details className="card"><summary style={{ fontWeight: 700, cursor: "pointer" }}>열림 일시 변경 기록 ({cfg.log.length})</summary>
          {cfg.log.map((l, i) => <div key={i} className="small">{l.at.slice(0, 16).replace("T", " ")} · {l.by} · {l.from ? l.from.replace("T", " ") : "(없음)"} → {l.to ? l.to.replace("T", " ") : "(취소)"}</div>)}
        </details>
      )}
    </div>
  );
}
