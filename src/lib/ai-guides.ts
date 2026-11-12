import { DEFAULT_GUIDELINES, getSetting } from "./store";

// AI가 개입하는 지점마다 관리자가 추가 지침을 쓸 수 있다. 공통 지침(aiGuidelines)에 이 지점 지침을 덧붙여 AI에 전달한다.
export const AI_POINTS = [
  { key: "followup", label: "인터뷰 후속 질문", hint: "AI가 회원 답변을 보고 이어서 묻는 질문의 주제·말투·깊이" },
  { key: "draft", label: "소개 글 초안 작성", hint: "인터뷰 답변으로 별칭 소개 글을 쓸 때의 분량·문체·구성" },
  { key: "truthlies", label: "2진실 1거짓 문장 만들기", hint: "소개 글에 쓰지 않은 내용으로 만드는 문장의 난이도·종류" },
  { key: "revise", label: "소개 글 수정 요청 반영", hint: "회원의 수정 요청을 받아들이거나 거절하는 기준" },
  { key: "worry", label: "고민 관점 제안 (진행 도우미)", hint: "고민에 대해 AI가 제시하는 관점의 톤과 금지 사항" },
] as const;
export type AiPoint = (typeof AI_POINTS)[number]["key"];

const keyOf = (p: AiPoint) => `aiGuide:${p}`;

export async function pointGuides(): Promise<Record<AiPoint, string>> {
  const out = {} as Record<AiPoint, string>;
  for (const p of AI_POINTS) out[p.key] = await getSetting<string>(keyOf(p.key), "");
  return out;
}

// 공통 지침 + 이 지점의 추가 지침
export async function guidelinesFor(point: AiPoint): Promise<string> {
  const common = await getSetting<string>("aiGuidelines", DEFAULT_GUIDELINES);
  const extra = (await getSetting<string>(keyOf(point), "")).trim();
  return extra ? `${common}\n\n[${AI_POINTS.find((p) => p.key === point)?.label} 단계 추가 지침]\n${extra}` : common;
}

export { keyOf as pointKey };
