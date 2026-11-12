"use client";

import { useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { api } from "@/lib/client";

type S = {
  questions: string[]; guidelines: string; followUpMax: number; aiEnabled: boolean;
  points: { key: string; label: string; hint: string }[]; pointGuides: Record<string, string>;
};

function AiSettings() {
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<S>("/api/admin/interview-settings").then((r) => (r.ok ? setS(r.data) : setMsg({ tone: "bad", text: r.error })));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!s) return;
    setBusy(true);
    const r = await api("/api/admin/interview-settings", { method: "PUT", body: { questions: s.questions, guidelines: s.guidelines, followUpMax: s.followUpMax, pointGuides: s.pointGuides } });
    setBusy(false);
    setMsg(r.ok ? { tone: "info", text: "저장했어요. 앞으로 시작하는 인터뷰부터 적용돼요." } : { tone: "bad", text: r.error });
  }

  if (!s) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;
  const setQ = (i: number, v: string) => setS({ ...s, questions: s.questions.map((q, j) => (j === i ? v : q)) });

  return (
    <form onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className={`msg ${s.aiEnabled ? "info" : "bad"}`} role="status" style={s.aiEnabled ? undefined : { background: "var(--orange-bg)", color: "var(--orange-t)" }}>
        {s.aiEnabled ? "AI가 연결되어 있어요. 아래 지침이 모든 AI 호출에 포함돼요." : "AI가 아직 연결되지 않았어요(API 키 없음). 지금은 정해진 질문과 직접 작성(수동 모드)으로 진행돼요. 지침은 연결 후에 적용돼요."}
      </div>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 20px var(--display)" }}>인터뷰 필수 질문</b>
        {s.questions.map((q, i) => (
          <div key={i} className="row">
            <input aria-label={`질문 ${i + 1}`} className="field" value={q} onChange={(e) => setQ(i, e.target.value)} />
            <button className="mini danger" type="button" disabled={s.questions.length <= 1} style={{ minHeight: 54 }} onClick={() => setS({ ...s, questions: s.questions.filter((_, j) => j !== i) })}>삭제</button>
          </div>
        ))}
        <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start" }} onClick={() => setS({ ...s, questions: [...s.questions, ""] })}>+ 질문 추가</button>
        <div style={{ maxWidth: 260 }}>
          <label className="l" htmlFor="fu">AI 후속 질문 최대 개수</label>
          <input id="fu" className="field" type="number" min={0} max={12} value={s.followUpMax} onChange={(e) => setS({ ...s, followUpMax: Number(e.target.value) })} />
        </div>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 20px var(--display)" }}>AI 지침</b>
        <span className="small">질문 주제, 말투, 금지 사항(신원 정보 등), 분량을 적어 주세요. 한 줄에 하나씩 적으면 읽기 쉬워요.</span>
        <label className="l" htmlFor="gl">관리자 지침</label>
        <textarea id="gl" className="field" rows={9} style={{ padding: 12, lineHeight: 1.6 }} value={s.guidelines} onChange={(e) => setS({ ...s, guidelines: e.target.value })} />
        <span className="small">AI가 어떻게 답하든 이름, 회사명, 직함은 서버가 한 번 더 걸러내요. 이 검사는 지침과 별개로 항상 적용돼요.</span>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: "400 20px var(--display)" }}>AI가 개입하는 단계별 추가 지침</b>
        <span className="small">위의 공통 지침에 더해, 단계마다 따로 적을 수 있어요. 비워 두면 공통 지침만 적용돼요.</span>
        {s.points.map((p) => (
          <div key={p.key}>
            <label className="l" htmlFor={`pg-${p.key}`}>{p.label}</label>
            <span className="small" style={{ display: "block", marginBottom: 4 }}>{p.hint}</span>
            <textarea id={`pg-${p.key}`} className="field" rows={4} style={{ padding: 12, lineHeight: 1.6 }} value={s.pointGuides[p.key] ?? ""} onChange={(e) => setS({ ...s, pointGuides: { ...s.pointGuides, [p.key]: e.target.value } })} />
          </div>
        ))}
      </div>

      <button className="btn" type="submit" disabled={busy || s.questions.some((q) => !q.trim())} style={{ width: "auto", minWidth: 200, alignSelf: "flex-start" }}>{busy ? "저장 중…" : "저장"}</button>
    </form>
  );
}

export default function AiPage() {
  return <AdminGate mode="events" need={["activities", "events"]} active="/admin/ai"><AiSettings /></AdminGate>;
}
