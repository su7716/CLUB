import { z } from "zod";

// 활동 템플릿 설정. 활동이 어떻게 반응할지는 코드가 아니라 이 설정이 정한다.
// 새 템플릿(AI가 만든 것 포함)은 이 스키마를 통과해야 저장된다.

// 회원 화면이 언제 켜지는지
//  host_click : 사회자/관리자가 버튼을 누르면 켜짐
//  immediate  : 단계가 시작되면 바로 켜짐
// (지정 일시에 켜지는 'scheduled'는 필요해질 때 추가한다.)
export const unlockSchema = z.enum(["host_click", "immediate"]);

export const memberScreenSchema = z.enum([
  "wait",        // 대기 화면
  "write",       // 작성 화면(타임캡슐, 고민 등)
  "vote",        // 투표 화면
  "iam_button",  // "저예요" 버튼
  "pick_person", // 명단에서 사람 고르기
  "view",        // 결과 보기
]);

export const stepSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  memberScreen: memberScreenSchema,
  unlock: unlockSchema,
  // 사회자 화면에 보이는 버튼 이름. 예: "투표", "타임캡슐 작성하기"
  hostButton: z.string().optional(),
});

export const preEventSchema = z.object({
  enabled: z.boolean(), // false면 행사 전 사전 작성 단계가 없다(현장에서만 진행)
  opensBeforeDays: z.number().int().min(0).optional(),
  closesBeforeDays: z.number().int().min(0).optional(),
  steps: z.array(z.string()).default([]),
});

export const templateConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().min(1),
  description: z.string().default(""),
  // 참여 대상: all(전체 회원) / selected(관리자 선택 회원).
  // selected 이면 관리자가 활동 전에 참여할 사람을 고르고(출석 체크) 완료해야 한다.
  // 활동에 들어가는 일(2진실 1거짓과 맞히기, 투표, 진행 대상, 고민 작성과 뽑기, 타임캡슐 작성)에 적용된다.
  // 선택되지 않은 회원은 활동에 들어가지 않고, 소개 활동이라면 AI 인터뷰로 프로필 북용 소개만 작성한다.
  participants: z.enum(["all", "selected"]).default("all"),
  preEvent: preEventSchema,
  guessPhase: preEventSchema.optional(),
  onsite: z.object({ steps: z.array(stepSchema).min(1) }),
  scoring: z
    .object({ enabled: z.boolean(), tieBreak: z.enum(["roulette", "none"]).default("roulette") })
    .optional(),
});

export type TemplateConfig = z.infer<typeof templateConfigSchema>;
export type TemplateStep = z.infer<typeof stepSchema>;

// 기본 템플릿 3종 (사용자 요청 활동)
export const DEFAULT_TEMPLATES: TemplateConfig[] = [
  {
    id: "who-am-i",
    name: "내가 누굴까요?",
    version: 1,
    participants: "selected", // 기본: 관리자가 선택한 회원만 참여(활동 전에 출석 체크)
    description: "AI 인터뷰로 별칭 소개글을 만들고, 누구인지 맞히고, 2진실 1거짓을 즐깁니다.",
    preEvent: {
      enabled: true,
      opensBeforeDays: 14,
      closesBeforeDays: 7,
      steps: ["alias", "ai_interview", "truth_lies", "reading_optional", "approve"],
    },
    guessPhase: { enabled: true, opensBeforeDays: 7, closesBeforeDays: 1, steps: ["guess"] },
    onsite: {
      steps: [
        { key: "intro", label: "소개 페이지 열기", memberScreen: "wait", unlock: "host_click", hostButton: "소개 열기" },
        { key: "reveal", label: "이름 공개", memberScreen: "iam_button", unlock: "host_click", hostButton: "이름 공개" },
        { key: "vote", label: "거짓 투표", memberScreen: "vote", unlock: "host_click", hostButton: "투표" },
        { key: "result", label: "정답 공개", memberScreen: "view", unlock: "host_click", hostButton: "정답 공개" },
      ],
    },
    scoring: { enabled: true, tieBreak: "roulette" },
  },
  {
    id: "worry-draw",
    name: "나의 고민은?",
    version: 1,
    participants: "selected", // 기본: 관리자가 선택한 회원만 참여(활동 전에 출석 체크)
    description: "고민을 미리 적어 두고, 현장에서 뽑아 15분씩 대화합니다.",
    preEvent: { enabled: true, opensBeforeDays: 14, closesBeforeDays: 1, steps: ["worry_write"] },
    onsite: {
      steps: [
        { key: "draw", label: "고민 뽑기", memberScreen: "wait", unlock: "host_click", hostButton: "고민 뽑기" },
        { key: "talk", label: "대화 타이머", memberScreen: "view", unlock: "immediate" },
        { key: "reveal", label: "이름 오픈", memberScreen: "view", unlock: "host_click", hostButton: "이름 오픈" },
      ],
    },
  },
  {
    id: "time-capsule",
    name: "타임캡슐",
    version: 1,
    participants: "selected", // 기본: 관리자가 선택한 회원만 참여(활동 전에 출석 체크)
    description: "1년 뒤 목표와 팀 약속을 현장에서 쓰고 봉인합니다.",
    preEvent: { enabled: false, steps: [] }, // 사전 작성 없음: 현장에서 작성
    onsite: {
      steps: [
        { key: "write", label: "작성", memberScreen: "write", unlock: "host_click", hostButton: "타임캡슐 작성하기" },
        { key: "seal", label: "봉인", memberScreen: "wait", unlock: "host_click", hostButton: "봉인하기" },
      ],
    },
  },
];
