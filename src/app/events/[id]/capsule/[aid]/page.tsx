"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";

type Data = {
  activity: { id: string; name: string };
  event: { id: string; name: string };
  canJoin: boolean;
  canWrite: boolean;
  team: { id: string; name: string; members: string[] } | null;
  openAt: string;
  opened: boolean;
  hasGoal: boolean;
  hasPact: boolean;
  content: null | { goal: string; pacts: string[] };
};

// 타임캡슐: 1년 뒤 목표(나만 볼 수 있어요)와 팀 약속 2가지.
// 열림 일시 전에는 서버가 내용을 내려주지 않으므로, 이 화면에서도 쓴 내용을 다시 볼 수 없다.
export default function CapsulePage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [goal, setGoal] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/capsule/${aid}`);
    if (r.ok) setD(r.data);
    else if (r.status === 401) router.replace("/");
    else setNote({ tone: "bad", text: r.error });
  }, [aid, router]);

  // 사회자가 작성을 열고 닫는 것을 따라가도록 2초마다 확인한다.
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    async function tick() {
      if (document.visibilityState === "visible") await load();
      if (!stop) t = setTimeout(tick, 2000);
    }
    tick();
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [load]);

  async function save(what: "goal" | "pacts") {
    setBusy(true);
    setNote(null);
    const body = what === "goal" ? { goal } : { pacts: [p1, p2] };
    const r = await api(`/api/capsule/${aid}`, { method: "PUT", body });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: what === "goal" ? "목표를 봉인함에 넣었어요. 열림 전에는 아무도 볼 수 없어요." : "팀 약속을 저장했어요. 팀원 누구나 열림 전까지 고칠 수 있어요." });
    if (what === "goal") setGoal("");
    await load();
  }

  if (!d) return <main className="app">{note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>}</main>;

  return (
    <main className="app">
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => router.push(`/events/${id}`)}>‹ {d.event.name}</button>
      <div className="row"><Mascot size={52} /><h1 className="title" style={{ fontSize: 24 }}>{d.activity.name}</h1></div>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}

      <div className="card row" style={{ flexWrap: "wrap" }}>
        <span className={`pill ${d.opened ? "ok" : "gray"}`}>{d.opened ? "열렸어요" : "봉인 중"}</span>
        <span className="small">{d.opened ? "함께 확인해 보세요." : d.openAt ? `${d.openAt.replace("T", " ")}에 열려요.` : "아직 열리지 않았어요."}</span>
      </div>

      {d.team ? (
        <div className="card"><b>{d.team.name}</b><div className="small">{d.team.members.join(", ")}</div></div>
      ) : (
        <div className="msg info">아직 팀이 정해지지 않았어요. 팀이 정해지면 팀 약속을 쓸 수 있어요.</div>
      )}

      {!d.canJoin && <div className="msg info">이 활동은 관리자가 선택한 회원만 참여할 수 있어요.</div>}

      {d.opened && d.content && (
        <>
          <div className="card"><b>나의 1년 뒤 목표</b><p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{d.content.goal || "작성하지 않았어요."}</p></div>
          <div className="card">
            <b>우리 팀 약속</b>
            {d.content.pacts.length === 0 ? <p className="small">작성하지 않았어요.</p> : <ol style={{ margin: "6px 0 0", paddingLeft: 20 }}>{d.content.pacts.map((p, i) => <li key={i}>{p}</li>)}</ol>}
          </div>
        </>
      )}

      {!d.opened && (
        <>
          {!d.canWrite && d.canJoin && (
            <div className="msg info" role="status">사회자가 “타임캡슐 작성하기”를 열면 쓸 수 있어요. 이 화면을 켜 두세요.</div>
          )}
          {d.hasGoal && <div className="msg info" role="status">내 목표를 봉인함에 넣었어요 ✓</div>}
          {d.hasPact && <div className="msg info" role="status">우리 팀 약속이 저장돼 있어요 ✓</div>}
          {d.content?.goal && <div className="card"><b>내가 쓴 목표 (관리자가 확인을 허용했어요)</b><p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{d.content.goal}</p></div>}

          {d.canWrite && (
            <>
              <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <b style={{ font: "400 20px var(--display)" }}>나의 1년 뒤 목표</b>
                <span className="small">나만 볼 수 있어요. 봉인하면 열림 일시 전에는 나도 다시 볼 수 없어요.{d.hasGoal ? " 다시 쓰면 이전 내용을 대신해요." : ""}</span>
                <label className="l" htmlFor="c-goal">목표</label>
                <textarea id="c-goal" className="field" rows={4} style={{ padding: 12 }} maxLength={1000} value={goal} onChange={(e) => setGoal(e.target.value)} />
                <button className="btn" type="button" disabled={busy || !goal.trim()} onClick={() => save("goal")}>목표 봉인하기</button>
              </section>
              <section className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <b style={{ font: "400 20px var(--display)" }}>우리 팀 약속 2가지</b>
                <span className="small">{d.team ? "팀원이 함께 정해요. 저장하면 팀 이름과 구성원이 함께 남아요." : "팀이 정해진 뒤에 쓸 수 있어요."}</span>
                <label className="l" htmlFor="c-p1">약속 1</label>
                <input id="c-p1" className="field" maxLength={200} value={p1} disabled={!d.team} onChange={(e) => setP1(e.target.value)} />
                <label className="l" htmlFor="c-p2">약속 2</label>
                <input id="c-p2" className="field" maxLength={200} value={p2} disabled={!d.team} onChange={(e) => setP2(e.target.value)} />
                <button className="btn blue" type="button" disabled={busy || !d.team || !p1.trim() || !p2.trim()} onClick={() => save("pacts")}>팀 약속 저장하기</button>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
