import { randomUUID } from "node:crypto";
import { DEFAULT_TEMPLATES } from "../template-schema";
import type { Row, Store } from "./types";
import { LocalStore } from "./local";

let store: Store | null = null;
let seeding: Promise<void> | null = null;

async function create(): Promise<Store> {
  const id = process.env.GOOGLE_SHEET_ID;
  const cred = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (id && cred) {
    const { GoogleStore } = await import("./google");
    return new GoogleStore(id, cred);
  }
  return new LocalStore();
}

export async function getStore(): Promise<Store> {
  if (!store) store = await create();
  if (!seeding) seeding = seed(store);
  await seeding;
  return store;
}

// 처음 한 번 기본 설정, 기본 활동 템플릿 3종, 예시 데이터를 넣는다.
async function seed(s: Store): Promise<void> {
  await seedBase(s);
  await seedActivities(s);
  await seedInterview(s);
}

export const DEFAULT_QUESTIONS = [
  "어린 시절 가장 또렷하게 기억나는 장면이 있나요?",
  "살면서 겪은 특이한 경험이 있다면 들려주세요.",
  "인생의 터닝포인트라고 느낀 순간은 언제였나요?",
  "성공했거나 실패했던 경험 중 기억에 남는 것을 알려 주세요.",
  "삶의 기준이나 철학이 있다면 무엇인가요?",
  "즐겨 하는 취미는 무엇인가요?",
  "좋아하는 것을 알려 주세요.",
  "싫어하는 것을 알려 주세요.",
];

export const DEFAULT_GUIDELINES = [
  "이름, 회사명, 직함, 업종, 출신 학교 등 신원을 바로 알 수 있는 정보는 묻지도 쓰지도 않는다.",
  "답변에 그런 정보가 있으면 제거하거나 일반화한다(회사명은 '한 회사'로).",
  "말투는 따뜻하고 읽기 쉬운 존댓말로 쓴다.",
  "소개 글은 약 2페이지 분량으로 쓴다.",
  "2진실 1거짓은 소개 글에 쓰지 않은 내용으로 만들고, 너무 뻔하거나 실례가 되는 거짓은 피한다.",
].join("\n");

// 인터뷰 질문과 AI 지침의 기본값. 관리자가 바꿀 수 있다.
async function seedInterview(s: Store): Promise<void> {
  const settings = await s.list("Settings");
  if (settings.some((r) => r.id === "seeded3")) return;
  const put = (id: string, value: unknown) => s.insert("Settings", { id, value: JSON.stringify(value) });
  await put("interviewQuestions", DEFAULT_QUESTIONS);
  await put("aiGuidelines", DEFAULT_GUIDELINES);
  await put("followUpMax", 6);
  await put("seeded3", true);
}

// 송년 워크숍에 기본 활동 3개를 넣는다. 템플릿 설정을 복사해 행사별로 수정할 수 있게 한다.
async function seedActivities(s: Store): Promise<void> {
  const settings = await s.list("Settings");
  if (settings.some((r) => r.id === "seeded2")) return;
  const templates = await s.list("ActivityTemplates");
  let order = 1;
  for (const t of templates) {
    await s.insert("EventActivities", {
      eventId: "evt-workshop",
      templateId: t.id,
      templateVersion: t.version,
      config: t.config,
      state: "ready",
      order: String(order++),
    });
  }
  await s.insert("Settings", { id: "seeded2", value: "true" });
}

async function seedBase(s: Store): Promise<void> {
  const settings = await s.list("Settings");
  if (settings.some((r) => r.id === "seeded")) return;

  const put = (id: string, value: unknown) =>
    s.insert("Settings", { id, value: JSON.stringify(value) });

  await put("clubName", "AI 초격차 전략포럼(ASSF) 제6기 원우회");
  await put("clubShortName", "ASSF 6기 원우회");
  await put("inviteCode", process.env.INVITE_CODE ?? "123456");
  await put("memberKinds", [
    { value: "정회원", definition: "교육이수 + 원우회" },
    { value: "준회원", definition: "교육이수자 외 추천 등 합류 신청자 중 과반 찬성으로 자격을 얻은 분" },
    { value: "명예회원", definition: "교육과정 주관사 등" },
    { value: "회원대기", definition: "활동을 원치 않는 분 또는 합류 신청 후 대기 상태" },
    { value: "행사참관", definition: "1회 원우회 활동 참석" },
  ]);

  for (const t of DEFAULT_TEMPLATES) {
    await s.insert("ActivityTemplates", {
      id: t.id,
      name: t.name,
      version: String(t.version),
      config: JSON.stringify(t),
      origin: "default",
    });
  }

  // 예시 회원(실제 정보 아님). 첫 번째 회원이 관리자.
  const sample: Partial<Row>[] = [
    { name: "김하늘", kind: "정회원", position: "회장", perms: "all" },
    { name: "이도윤", kind: "정회원", position: "사무총장", perms: "all" },
    { name: "박서진", kind: "정회원", position: "", perms: "" },
    { name: "정유나", kind: "정회원", position: "", perms: "" },
    { name: "최태호", kind: "명예회원", position: "", perms: "" },
  ];
  let no = 1;
  for (const m of sample) {
    await s.insert("Members", { id: randomUUID(), no: String(no++), ...m });
  }

  await s.insert("Events", {
    id: "evt-workshop",
    type: "워크숍",
    name: "송년 워크숍",
    startsAt: "2026-12-11T14:00",
    endsAt: "2026-12-12T12:00",
    place: "대명 홍천 소노펠리체",
    status: "준비 중",
    published: "true",
    fee: "150000",
    feeDeadline: "2026-11-30",
    account: "예시은행 000-00-0000",
  });
  await s.insert("Events", {
    id: "evt-regular",
    type: "전체정기모임",
    name: "2027 신년 정기모임",
    status: "초안",
    published: "true",
  });
  await s.insert("Events", {
    id: "evt-golf",
    type: "소모임",
    name: "골프 소모임 3월",
    startsAt: "2027-03-14T08:00",
    status: "모집 중",
    published: "true",
  });

  await put("seeded", true);
}

export async function getSetting<T>(id: string, fallback: T): Promise<T> {
  const s = await getStore();
  const row = (await s.list("Settings")).find((r) => r.id === id);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(id: string, value: unknown): Promise<void> {
  const s = await getStore();
  const row = (await s.list("Settings")).find((r) => r.id === id);
  const v = JSON.stringify(value);
  if (row) await s.update("Settings", id, { value: v });
  else await s.insert("Settings", { id, value: v });
}
