"use client";

import type { TemplateConfig } from "@/lib/template-schema";

export type EditableConfig = Omit<TemplateConfig, "id" | "version">;

export const SCREEN_LABELS: Record<string, string> = {
  wait: "대기 화면",
  write: "작성 화면",
  vote: "투표 화면",
  iam_button: "“저예요” 버튼",
  pick_person: "명단에서 사람 고르기",
  view: "결과 보기",
};
export const UNLOCK_LABELS: Record<string, string> = {
  host_click: "사회자가 버튼을 누르면 켜짐",
  immediate: "단계가 시작되면 바로 켜짐",
};

// 템플릿과 행사별 활동 설정을 같은 화면으로 고친다.
// 여기서 정한 값이 회원 앱의 동작(사전 작성 여부, 회원 화면이 켜지는 시점)을 결정한다.
export function TemplateEditor({ value, onChange }: { value: EditableConfig; onChange: (v: EditableConfig) => void }) {
  const steps = value.onsite.steps;
  const setStep = (i: number, patch: Partial<(typeof steps)[number]>) =>
    onChange({ ...value, onsite: { steps: steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) } });
  const pre = value.preEvent;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="grid2">
        <div><label className="l" htmlFor="t-name">활동 이름</label><input id="t-name" className="field" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
        <div><label className="l" htmlFor="t-desc">설명</label><input id="t-desc" className="field" value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} /></div>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 19px var(--display)" }}>참여 대상</b>
        <label className="l" htmlFor="t-part">이 활동에 참여하는 사람</label>
        <select id="t-part" className="field" value={value.participants} onChange={(e) => onChange({ ...value, participants: e.target.value as "all" | "selected" })}>
          <option value="selected">관리자 선택 회원 (활동 전에 출석 체크)</option>
          <option value="all">전체 회원</option>
        </select>
        <span className="small">“관리자 선택 회원”으로 하면 행사에서 관리자가 참여할 사람을 고르고(출석 체크) 활동 전에 완료해야 시작할 수 있어요. 선택된 회원만 활동에 참여하고 정보가 노출돼요(2진실 1거짓과 맞히기, 투표, 고민 작성과 뽑기, 타임캡슐 작성). 선택되지 않은 회원은 활동에 들어가지 않고, 소개 활동이라면 AI 인터뷰로 프로필 북용 소개만 작성해요.</span>
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <b style={{ font: "400 19px var(--display)" }}>행사 전 사전 작성</b>
        <div className="checks">
          <label>
            <input type="checkbox" checked={pre.enabled} onChange={(e) => onChange({ ...value, preEvent: { ...pre, enabled: e.target.checked } })} />
            사전 작성 단계가 있어요
          </label>
        </div>
        {!pre.enabled && <span className="small">끄면 이 활동은 행사 당일 현장에서만 진행하고, 회원 홈에 “현장에서 진행”으로 표시돼요.</span>}
        {pre.enabled && (
          <div className="grid2">
            <div><label className="l" htmlFor="t-open">작성 시작 (행사 며칠 전)</label><input id="t-open" className="field" type="number" min={0} value={pre.opensBeforeDays ?? 14} onChange={(e) => onChange({ ...value, preEvent: { ...pre, opensBeforeDays: Number(e.target.value) } })} /></div>
            <div><label className="l" htmlFor="t-close">작성 마감 (행사 며칠 전)</label><input id="t-close" className="field" type="number" min={0} value={pre.closesBeforeDays ?? 1} onChange={(e) => onChange({ ...value, preEvent: { ...pre, closesBeforeDays: Number(e.target.value) } })} /></div>
          </div>
        )}
      </div>

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <b style={{ font: "400 19px var(--display)" }}>현장 진행 단계</b>
        {steps.map((st, i) => (
          <div key={st.key} className="card" style={{ background: "var(--soft)", display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="grid2">
              <div><label className="l" htmlFor={`s-l-${i}`}>단계 이름</label><input id={`s-l-${i}`} className="field" value={st.label} onChange={(e) => setStep(i, { label: e.target.value })} /></div>
              <div><label className="l" htmlFor={`s-b-${i}`}>사회자 버튼 이름 (비우면 버튼 없음)</label><input id={`s-b-${i}`} className="field" value={st.hostButton ?? ""} onChange={(e) => setStep(i, { hostButton: e.target.value || undefined })} /></div>
              <div>
                <label className="l" htmlFor={`s-s-${i}`}>회원 휴대폰에 보이는 화면</label>
                <select id={`s-s-${i}`} className="field" value={st.memberScreen} onChange={(e) => setStep(i, { memberScreen: e.target.value as typeof st.memberScreen })}>
                  {Object.entries(SCREEN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="l" htmlFor={`s-u-${i}`}>회원 화면이 켜지는 때</label>
                <select id={`s-u-${i}`} className="field" value={st.unlock} onChange={(e) => setStep(i, { unlock: e.target.value as typeof st.unlock })}>
                  {Object.entries(UNLOCK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="row">
              <button className="mini" type="button" disabled={i === 0} onClick={() => onChange({ ...value, onsite: { steps: swap(steps, i, i - 1) } })}>위로</button>
              <button className="mini" type="button" disabled={i === steps.length - 1} onClick={() => onChange({ ...value, onsite: { steps: swap(steps, i, i + 1) } })}>아래로</button>
              <button className="mini danger" type="button" disabled={steps.length <= 1} onClick={() => onChange({ ...value, onsite: { steps: steps.filter((_, j) => j !== i) } })}>단계 지우기</button>
            </div>
          </div>
        ))}
        <button
          className="btn white"
          type="button"
          style={{ width: "auto", alignSelf: "flex-start" }}
          onClick={() => onChange({ ...value, onsite: { steps: [...steps, { key: nextKey(steps), label: "새 단계", memberScreen: "wait", unlock: "host_click", hostButton: "시작" }] } })}
        >
          + 단계 추가
        </button>
      </div>
    </div>
  );
}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const out = [...arr];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}
function nextKey(steps: { key: string }[]): string {
  let n = steps.length + 1;
  while (steps.some((s) => s.key === `step-${n}`)) n++;
  return `step-${n}`;
}
