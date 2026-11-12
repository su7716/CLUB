"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { api } from "@/lib/client";

type Mine = { id: string; body: string; category: string; anonymous: boolean; drawn: boolean };
type Data = {
  activity: { id: string; name: string };
  event: { id: string; name: string };
  pre: { status: string; opensAt: string; closesAt: string };
  max: number;
  categories: string[];
  canJoin: boolean;
  mine: Mine[];
};
const WHEN: Record<string, string> = {
  before: "아직 작성 기간이 아니에요.", closed: "작성 기간이 끝났어요.", unknown: "행사 날짜가 정해지면 작성 기간이 열려요.", none: "이 활동에는 사전 작성이 없어요.",
};

// 고민(또는 조언을 구하고 싶은 질문) 작성. 익명/실명은 작성할 때 미리 정한다.
export default function WorryPage({ params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Data | null>(null);
  const [note, setNote] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<string | null>(null); // null: 새로 쓰기
  const [body, setBody] = useState("");
  const [cat, setCat] = useState("경영");
  const [anon, setAnon] = useState(false);

  const load = useCallback(async () => {
    const r = await api<Data>(`/api/worry/${aid}`);
    if (r.ok) setD(r.data);
    else if (r.status === 401) router.replace("/");
    else setNote({ tone: "bad", text: r.error });
  }, [aid, router]);
  useEffect(() => {
    load();
  }, [load]);

  function reset() {
    setEdit(null);
    setBody("");
    setCat(d?.categories[0] ?? "경영");
    setAnon(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    const payload = { body, category: cat, anonymous: anon };
    const r = edit ? await api(`/api/worry/${aid}/${edit}`, { method: "PATCH", body: payload }) : await api(`/api/worry/${aid}`, { body: payload });
    setBusy(false);
    if (!r.ok) return setNote({ tone: "bad", text: r.error });
    setNote({ tone: "info", text: edit ? "고쳤어요." : "저장했어요. 뽑히기 전에는 아무에게도 보이지 않아요." });
    reset();
    load();
  }

  async function remove(m: Mine) {
    if (!window.confirm("이 고민을 지울까요?")) return;
    const r = await api(`/api/worry/${aid}/${m.id}`, { method: "DELETE" });
    setNote(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  if (!d) return <main className="app">{note ? <div className="msg bad" role="alert">{note.text}</div> : <p className="small">불러오는 중이에요…</p>}</main>;
  const open = d.pre.status === "open" && d.canJoin;

  return (
    <main className="app">
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => router.push(`/events/${id}`)}>‹ {d.event.name}</button>
      <div className="row"><Mascot size={52} /><h1 className="title" style={{ fontSize: 24 }}>{d.activity.name}</h1></div>
      <p className="small" style={{ margin: 0 }}>고민이나 조언을 구하고 싶은 질문을 적어 주세요. 행사에서 뽑힌 고민은 큰 화면에 내용만 나오고, 작성자는 대화가 끝난 뒤에 공개돼요.</p>
      {note && <div className={`msg ${note.tone}`} role={note.tone === "bad" ? "alert" : "status"}>{note.text}</div>}
      {!d.canJoin && <div className="msg info" role="status">이 활동은 관리자가 선택한 회원만 고민을 쓸 수 있어요. 참여 대상이 아니라면 고민은 쓰지 않고, 프로필 북에 실릴 소개만 작성해 주세요.</div>}
      {d.canJoin && !open && <div className="msg info">{WHEN[d.pre.status]}{d.pre.opensAt ? ` 작성 기간은 ${d.pre.opensAt} ~ ${d.pre.closesAt} 예요.` : ""}</div>}

      {d.mine.length > 0 && (
        <section aria-label="내 고민" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ font: "400 20px var(--display)" }}>내가 쓴 고민 {d.mine.length}/{d.max}</b>
          {d.mine.map((m) => (
            <div key={m.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="row" style={{ flexWrap: "wrap" }}>
                <span className="pill blue">{m.category}</span>
                <span className={`pill ${m.anonymous ? "gray" : "ok"}`}>{m.anonymous ? "익명" : "실명"}</span>
                {m.drawn && <span className="pill warn">이미 뽑혔어요</span>}
              </div>
              <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.body}</p>
              {open && !m.drawn && (
                <div className="row">
                  <button className="mini" type="button" onClick={() => { setEdit(m.id); setBody(m.body); setCat(m.category); setAnon(m.anonymous); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }}>수정</button>
                  <button className="mini danger" type="button" onClick={() => remove(m)}>삭제</button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {open && (edit !== null || d.mine.length < d.max) && (
        <form className="card" onSubmit={save} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <b style={{ font: "400 20px var(--display)" }}>{edit ? "고민 수정" : "새 고민 쓰기"}</b>
          <div>
            <label className="l" htmlFor="w-body">고민 또는 조언을 구하고 싶은 질문</label>
            <textarea id="w-body" className="field" rows={5} style={{ padding: 12, lineHeight: 1.6 }} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
            <span className="hint">{body.length}/500자</span>
          </div>
          <div>
            <label className="l" htmlFor="w-cat">카테고리</label>
            <select id="w-cat" className="field" value={cat} onChange={(e) => setCat(e.target.value)}>
              {d.categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="l">이름 공개 방식 (미리 정해 주세요)</legend>
            <div className="pick">
              <button type="button" className="opt" aria-pressed={!anon} onClick={() => setAnon(false)}><span className="name">{!anon ? "✓ " : ""}실명으로 공개</span><span className="small">대화가 끝나면 이름이 나와요</span></button>
              <button type="button" className="opt" aria-pressed={anon} onClick={() => setAnon(true)}><span className="name">{anon ? "✓ " : ""}익명으로</span><span className="small">“익명”으로 나오고, 원하면 그때 직접 밝힐 수 있어요</span></button>
            </div>
          </fieldset>
          <div className="row">
            <button className="btn" type="submit" disabled={busy || body.trim().length < 2}>{edit ? "저장" : "저장하기"}</button>
            {edit && <button className="btn white" type="button" onClick={reset}>취소</button>}
          </div>
        </form>
      )}
    </main>
  );
}
