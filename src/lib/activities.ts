import { randomUUID } from "node:crypto";
import { templateConfigSchema, type TemplateConfig, type TemplateStep } from "./template-schema";

// 템플릿 설정(JSON 문자열)을 읽는다. 스키마에 맞지 않으면 null.
export function readConfig(json: string | undefined): TemplateConfig | null {
  if (!json) return null;
  try {
    const r = templateConfigSchema.safeParse(JSON.parse(json));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

// 새 템플릿/수정 요청 본문: id, version 은 서버가 정한다. 단계 키는 중복되면 안 된다.
export const templateInput = templateConfigSchema
  .omit({ id: true, version: true })
  .refine((c) => new Set(c.onsite.steps.map((s) => s.key)).size === c.onsite.steps.length, {
    message: "단계 키가 겹쳐요.",
  });

export function newTemplateId(): string {
  return `tpl-${randomUUID().slice(0, 8)}`;
}

const DAY = 24 * 60 * 60 * 1000;

// 행사 일시(한국 시간)를 시각으로 바꾼다.
export function eventStart(startsAt: string): number | null {
  if (!startsAt) return null;
  const t = Date.parse(startsAt.length <= 16 ? `${startsAt}:00+09:00` : startsAt);
  return Number.isNaN(t) ? null : t;
}

export type PreStatus = {
  enabled: boolean;
  // none: 사전 작성 없음(현장에서 진행) / unknown: 행사 날짜 미정 / before / open / closed
  status: "none" | "unknown" | "before" | "open" | "closed";
  opensAt: string; // 안내용 날짜(YYYY-MM-DD)
  closesAt: string;
};

const ymd = (t: number) => new Date(t + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

// 템플릿의 사전 작성 설정과 행사 날짜로 지금 상태를 계산한다.
type Win = { enabled: boolean; opensBeforeDays?: number; closesBeforeDays?: number };

// 행사 며칠 전부터 며칠 전까지 열리는 기간의 현재 상태
export function windowStatus(win: Win | undefined, startsAt: string, now = Date.now()): PreStatus {
  if (!win || !win.enabled) return { enabled: false, status: "none", opensAt: "", closesAt: "" };
  const start = eventStart(startsAt);
  if (start == null) return { enabled: true, status: "unknown", opensAt: "", closesAt: "" };
  const opens = start - (win.opensBeforeDays ?? 14) * DAY;
  const closes = start - (win.closesBeforeDays ?? 1) * DAY;
  const status = now < opens ? "before" : now > closes ? "closed" : "open";
  return { enabled: true, status, opensAt: ymd(opens), closesAt: ymd(closes) };
}

export function preStatus(cfg: TemplateConfig, startsAt: string, now = Date.now()): PreStatus {
  return windowStatus(cfg.preEvent, startsAt, now);
}

export function guessStatus(cfg: TemplateConfig, startsAt: string, now = Date.now()): PreStatus {
  return windowStatus(cfg.guessPhase, startsAt, now);
}

// '내가 누굴까요?' 방식(AI 인터뷰로 소개 작성)의 활동인지: 템플릿의 사전 작성 단계로 판단한다.
export function isWhoAmI(cfg: TemplateConfig): boolean {
  return cfg.preEvent.steps.includes("ai_interview");
}

export type Kind = "who" | "worry" | "capsule" | "";

// 활동 종류는 템플릿 설정으로 알아낸다(템플릿 이름이 아니라 단계 구성).
//  who     : AI 인터뷰로 소개를 쓰는 활동
//  worry   : 사전에 고민을 적는 활동
//  capsule : 현장에서 작성 화면이 열리는 활동
export function activityKind(cfg: TemplateConfig): Kind {
  if (isWhoAmI(cfg)) return "who";
  if (cfg.preEvent.steps.includes("worry_write")) return "worry";
  if (cfg.onsite.steps.some((s) => s.memberScreen === "write")) return "capsule";
  return "";
}

export type LiveView = {
  active: boolean; // 사회자가 현장 단계를 시작했는지
  stepKey: string;
  stepLabel: string;
  unlocked: boolean; // 회원 화면이 켜졌는지
  memberScreen: TemplateStep["memberScreen"]; // 회원이 보는 화면 (잠겨 있으면 wait)
};

// 현장 진행 상태(LiveState)와 템플릿으로 회원 화면을 정한다.
// 회원 앱은 활동별 코드를 갖지 않고 이 결과만 보고 화면을 켜고 끈다.
export function liveView(cfg: TemplateConfig, live: Record<string, string> | undefined): LiveView {
  const step = live?.step ? cfg.onsite.steps.find((s) => s.key === live.step) : undefined;
  if (!step) return { active: false, stepKey: "", stepLabel: "", unlocked: false, memberScreen: "wait" };
  const unlocked = live?.memberUnlocked === "true";
  return {
    active: true,
    stepKey: step.key,
    stepLabel: step.label,
    unlocked,
    memberScreen: unlocked ? step.memberScreen : "wait",
  };
}
