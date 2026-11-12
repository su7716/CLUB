"use client";

import { useState } from "react";
import { AdminGate } from "@/components/AdminGate";

const TABS: [string, string][] = [
  ["Members", "회원 명단"], ["Events", "행사"], ["EventApplies", "참석 신청·회비"], ["EventCosts", "비용"], ["EventPrep", "준비 목록"],
  ["EventSchedule", "일정"], ["Groupings", "조편성"], ["Carpools", "카풀"], ["Rooms", "방배정"], ["Org", "조직도"], ["Rules", "회칙"], ["Minutes", "회의록"],
  ["Profiles", "프로필(공개된 소개)"], ["Guesses", "사전 추측"], ["Votes", "투표"], ["Settings", "설정"],
];

// 전체 데이터 내려받기. 파일은 브라우저가 직접 내려받는다.
function Export() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);

  async function download(query: string, fallback: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/admin/export?${query}`, { cache: "no-store" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error ?? "내려받지 못했어요.");
      }
      const cd = r.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(cd)?.[1] ?? fallback;
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      setMsg({ tone: "info", text: `${name} 파일을 내려받았어요.` });
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "내려받지 못했어요." });
    }
    setBusy(false);
  }

  return (
    <>
      <p className="small" style={{ margin: 0 }}>백업용으로 전체 데이터를 내려받아요. “모든 권한” 관리자만 할 수 있어요.</p>
      <div className="msg info">인터뷰 원문, 타임캡슐 본문, 아직 공개되지 않은 고민과 소개 초안은 본인 외에는 볼 수 없게 정한 내용이라 내려받는 파일에 포함되지 않아요. 초대코드도 빠져요.</div>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 20px var(--display)" }}>전체 백업 (JSON)</b>
        <button className="btn" type="button" disabled={busy} style={{ width: "auto", alignSelf: "flex-start", minHeight: 50 }} onClick={() => download("format=json", "backup.json")}>전체 데이터 내려받기</button>
      </div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 20px var(--display)" }}>항목별 내려받기 (CSV, 엑셀에서 열 수 있어요)</b>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {TABS.map(([tab, label]) => <button key={tab} className="mini" type="button" disabled={busy} onClick={() => download(`format=csv&tab=${tab}`, `${tab}.csv`)}>{label}</button>)}
        </div>
      </div>
    </>
  );
}

export default function ExportPage() {
  return <AdminGate mode="members" need={["all"]} active="/admin/export"><Export /></AdminGate>;
}
