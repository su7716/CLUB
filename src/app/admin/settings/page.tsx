"use client";

import { useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api } from "@/lib/client";

type Kind = { value: string; definition: string };
type S = { clubName: string; clubShortName: string; inviteCode: string; memberKinds: Kind[] };

function Settings() {
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<S>("/api/admin/settings").then((r) => (r.ok ? setS(r.data) : setMsg({ tone: "bad", text: r.error })));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    setMsg(null);
    const r = await api("/api/admin/settings", { method: "PUT", body: s });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "저장했어요. 회원 화면에 바로 적용돼요." } : { tone: "bad", text: r.error });
  }

  if (!s) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const setKind = (i: number, patch: Partial<Kind>) =>
    setS({ ...s, memberKinds: s.memberKinds.map((k, j) => (j === i ? { ...k, ...patch } : k)) });

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: "400 20px var(--display)" }}>원우회 이름</b>
        <div className="grid2">
          <div><label className="l" htmlFor="s-name">원우회 이름 (회원 첫 화면에 표시)</label><input id="s-name" className="field" value={s.clubName} onChange={(e) => setS({ ...s, clubName: e.target.value })} /></div>
          <div><label className="l" htmlFor="s-short">줄여 쓰는 이름</label><input id="s-short" className="field" value={s.clubShortName} onChange={(e) => setS({ ...s, clubShortName: e.target.value })} /></div>
          <div><label className="l" htmlFor="s-code">초대코드 (4자 이상)</label><input id="s-code" className="field" value={s.inviteCode} onChange={(e) => setS({ ...s, inviteCode: e.target.value })} /></div>
        </div>
        <span className="small">모임 이름이 정해지면 여기서 바꿔요. 바꾸면 회원 화면 전체에 적용돼요.</span>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: "400 20px var(--display)" }}>회원구분 값과 정의</b>
        {s.memberKinds.map((k, i) => (
          <div key={i} className="grid2" style={{ alignItems: "end" }}>
            <div><label className="l" htmlFor={`k-v-${i}`}>구분 이름</label><input id={`k-v-${i}`} className="field" value={k.value} onChange={(e) => setKind(i, { value: e.target.value })} /></div>
            <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
              <div style={{ flex: 1 }}><label className="l" htmlFor={`k-d-${i}`}>정의</label><input id={`k-d-${i}`} className="field" value={k.definition} onChange={(e) => setKind(i, { definition: e.target.value })} /></div>
              <button className="mini danger" type="button" disabled={s.memberKinds.length <= 1} onClick={() => setS({ ...s, memberKinds: s.memberKinds.filter((_, j) => j !== i) })} style={{ minHeight: 54 }}>삭제</button>
            </div>
          </div>
        ))}
        <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start" }} onClick={() => setS({ ...s, memberKinds: [...s.memberKinds, { value: "", definition: "" }] })}>+ 회원구분 추가</button>
        <span className="small">이미 회원에게 지정한 구분 이름을 바꾸면 명단의 값은 그대로 남아요. 이름을 바꾼 뒤 회원 명단에서 다시 지정해 주세요.</span>
      </div>

      <button className="btn" type="submit" disabled={busy} style={{ width: "auto", minWidth: 200, alignSelf: "flex-start" }}>{busy ? "저장 중…" : "저장"}</button>
      <ProfileReveal />
    </form>
  );
}

// 프로필 북 실명 공개 시점. 이 시각 전에는 별칭으로만 보인다.
function ProfileReveal() {
  const [at, setAt] = useState("");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  useEffect(() => {
    api<{ revealAt: string }>("/api/admin/profile-settings").then((r) => r.ok && setAt(r.data.revealAt));
  }, []);
  async function save() {
    const r = await api("/api/admin/profile-settings", { method: "PUT", body: { revealAt: at } });
    setMsg(r.ok ? { tone: "info", text: at ? "실명 공개 시점을 저장했어요." : "공개 시점을 지웠어요. 별칭으로만 보여요." } : { tone: "bad", text: r.error });
  }
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b style={{ font: "400 20px var(--display)" }}>프로필 북 실명 공개 시점</b>
      <span className="small">행사가 끝난 뒤 별칭 대신 실명으로 보여 줄 시점이에요(한국 시간). 비워 두면 계속 별칭으로만 보여요.</span>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <input aria-label="실명 공개 시점" className="field" type="datetime-local" style={{ maxWidth: 280 }} value={at} onChange={(e) => setAt(e.target.value)} />
        <button className="mini" type="button" style={{ minHeight: 54 }} onClick={save}>저장</button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return <AdminGate mode="members" need={["members"]} active="/admin/settings"><Settings /></AdminGate>;
}
