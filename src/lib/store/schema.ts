// 구글 시트 탭과 열 정의. 첫 열은 항상 id.
// 값은 모두 문자열로 저장하고, 객체/배열은 JSON 문자열로 저장한다.
export const TABS = {
  Settings: ["id", "value"],
  Members: [
    "id", "no", "name", "kind", "position", "gender", "company", "title",
    "birth", "phone", "ageGroup", "perms", "extra",
  ],
  Org: ["id", "dept", "role", "memberId", "clubName", "frequency", "leaderId"],
  Rules: ["id", "chapter", "article", "body", "version", "confirmed"],
  Minutes: ["id", "heldAt", "place", "attendees", "agenda", "status", "followUp"],
  Events: [
    "id", "type", "name", "startsAt", "endsAt", "place", "booking", "status",
    "published", "fee", "feeDeadline", "account",
  ],
  EventApplies: [
    "id", "eventId", "memberId", "answer", "days", "paid", "paidAt", "memo",
  ],
  EventCosts: ["id", "eventId", "item", "budget", "spent", "status", "owner"],
  EventPrep: ["id", "eventId", "item", "owner", "done"],
  EventSchedule: ["id", "eventId", "at", "title"],
  ActivityTemplates: ["id", "name", "version", "config", "origin"],
  // startsAt/endsAt: 이 활동이 진행되는 날짜와 시간(한국 시간, YYYY-MM-DDTHH:mm). 비어 있으면 시간 제한 없음.
  EventActivities: ["id", "eventId", "templateId", "templateVersion", "config", "state", "order", "startsAt", "endsAt"],
  // 활동별 출석 체크: 자동 명단(날짜 선택 기반)을 관리자가 고칠 때만 행이 생긴다. present: true(출석) / false(결석)
  Attendance: ["id", "eventActivityId", "memberId", "present"],
  Teams: ["id", "eventActivityId", "name", "memberIds"],
  // 행사 조편성(여러 개 가능, 예: 저녁 게임 3개 조). teams 는 [{name, memberIds}] JSON. published 가 true 여야 회원에게 보인다.
  Groupings: ["id", "eventId", "title", "teams", "published", "updatedAt"],
  // from/to: 출발·도착 장소, departAt/arriveAt: 출발·도착 예상 시간
  Carpools: ["id", "eventId", "leg", "driverId", "seats", "from", "departAt", "riders", "to", "arriveAt", "plate", "name"],
  // 숙박 방배정: date(YYYY-MM-DD) 날짜별 방, guests 는 회원 id 배열 JSON
  Rooms: ["id", "eventId", "date", "name", "capacity", "memo", "guests"],
  LiveState: ["id", "eventActivityId", "step", "memberUnlocked", "payload", "updatedAt"],
  // 내가 누굴까요? : 프로필(회원당 1개), 인터뷰 원문(본인만), 2진실 1거짓, 사전 추측
  Profiles: [
    "id", "memberId", "alias", "draftMd", "introMd", "introStatus", "publicFields",
    "readingMd", "readingStatus", "approvedAt", "updatedAt",
  ],
  Interviews: ["id", "memberId", "eventActivityId", "messages", "status", "updatedAt"],
  TruthLies: ["id", "memberId", "eventActivityId", "statements", "lieIndex", "status", "approvedAt"],
  Guesses: ["id", "eventActivityId", "guesserId", "targetMemberId", "chosenMemberId", "createdAt"],
  // 나의 고민은?
  Worries: [
    "id", "eventActivityId", "memberId", "body", "category", "anonymous", "drawnAt",
    "orderNo", "nameRevealed", "authorShown", "updatedAt",
  ],
  // 타임캡슐: body 는 서버 키로 암호화해서 저장한다. kind: goal(개인 목표, ownerId=회원) / pact(팀 약속, ownerId=팀)
  Capsules: ["id", "eventActivityId", "kind", "ownerId", "body", "lastBy", "updatedAt"],
  // 현장 진행: 한 사람씩 진행하는 라운드, 거짓 투표
  Rounds: ["id", "eventActivityId", "targetMemberId", "state", "orderNo", "nameRevealed", "updatedAt"],
  Votes: ["id", "roundId", "voterId", "chosenIndex", "createdAt"],
} as const;

export type TabName = keyof typeof TABS;
