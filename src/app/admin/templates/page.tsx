"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { TemplateEditor, type EditableConfig } from "@/components/TemplateEditor";
import { api } from "@/lib/client";
import type { TemplateConfig } from "@/lib/template-schema";

type T = { id: string; origin: string; version: number; config: TemplateConfig };

const strip = (c: TemplateConfig): EditableConfig => {
  const { id: _i, version: _v, ...rest } = c;
  void _i; void _v;
  return rest;
};
const BLANK: EditableConfig = {
  name: "새 활동",
  description: "",
  participants: "all",
  preEvent: { enabled: false, steps: [] },
  onsite: { steps: [{ key: "step-1", label: "시작", memberScreen: "wait", unlock: "host_click", hostButton: "시작" }] },
};

function Templates() {
  const [list, setList] = useState<T[] | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; value: EditableConfig } | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ templates: T[] }>("/api/admin/templates");
    if (r.ok) setList(r.data.templates);
    else setMsg({ tone: "bad", text: r.error });
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    setMsg(null);
    const r = edit.id
      ? await api(`/api/admin/templates/${edit.id}`, { method: "PUT", body: edit.value })
      : await api("/api/admin/templates", { body: edit.value });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: "저장했어요. 이미 행사에 넣은 활동은 그대로고, 앞으로 넣는 활동부터 바뀐 설정을 써요." });
    setEdit(null);
    load();
  }

  async function remove(t: T) {
    if (!window.confirm(`“${t.config.name}” 템플릿을 지울까요? 이미 행사에 넣은 활동은 그대로 남아요.`)) return;
    const r = await api(`/api/admin/templates/${t.id}`, { method: "DELETE" });
    setMsg(r.ok ? { tone: "info", text: "지웠어요." } : { tone: "bad", text: r.error });
    load();
  }

  return (
    <>
      <p className="small" style={{ margin: 0 }}>
        활동 템플릿은 행사에 넣을 활동의 설계도예요. 사전 작성이 있는지, 현장에서 어떤 단계로 진행하는지, 사회자가 버튼을 누를 때 회원 화면이 언제 켜지는지를 여기서 정해요.
      </p>
      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      {edit ? (
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <b style={{ font: "400 21px var(--display)" }}>{edit.id ? "템플릿 수정" : "새 템플릿"}</b>
          <TemplateEditor value={edit.value} onChange={(value) => setEdit({ ...edit, value })} />
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" type="button" disabled={busy || !edit.value.name.trim()} style={{ width: "auto", minWidth: 160 }} onClick={save}>{busy ? "저장 중…" : "저장"}</button>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 120 }} onClick={() => setEdit(null)}>취소</button>
          </div>
        </div>
      ) : (
        <>
          {!list && !msg && <p className="small">불러오는 중이에요…</p>}
          <div className="cards">
            {list?.map((t) => (
              <div key={t.id} className="card" style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                <span className={`pill ${t.origin === "default" ? "ok" : "blue"}`}>{t.origin === "default" ? "기본 템플릿" : "내가 만든 템플릿"} v{t.version}</span>
                <b style={{ font: "400 21px var(--display)" }}>{t.config.name}</b>
                <span className="small">{t.config.description}</span>
                <span className="small">{t.config.participants === "selected" ? "관리자 선택 회원만 · " : "전체 회원 · "}{t.config.preEvent.enabled ? `사전 작성 있음 (행사 ${t.config.preEvent.opensBeforeDays ?? 14}일 전 ~ ${t.config.preEvent.closesBeforeDays ?? 1}일 전)` : "현장에서만 진행"} · 현장 {t.config.onsite.steps.length}단계</span>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <button className="mini" type="button" onClick={() => setEdit({ id: t.id, value: strip(t.config) })}>수정</button>
                  <button className="mini" type="button" onClick={() => setEdit({ id: null, value: { ...strip(t.config), name: `${t.config.name} (복사본)` } })}>복제</button>
                  {t.origin !== "default" && <button className="mini danger" type="button" onClick={() => remove(t)}>삭제</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn" type="button" style={{ width: "auto", minWidth: 200 }} onClick={() => setEdit({ id: null, value: BLANK })}>+ 새 템플릿 만들기</button>
            <button className="btn white" type="button" style={{ width: "auto", minWidth: 220 }} disabled>AI로 새 템플릿 만들기 (준비 중)</button>
          </div>
        </>
      )}
    </>
  );
}

export default function TemplatesPage() {
  return <AdminGate mode="events" need={["activities", "events"]} active="/admin/templates"><Templates /></AdminGate>;
}
