import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";

export const NOT_ATTENDEE = "이 활동은 관리자가 선택한 회원만 참여할 수 있어요.";

// 활동 참여 대상
//  all      : 전체 회원
//  selected : 관리자 선택 회원. 관리자가 활동 전에 참여할 사람을 고르고(출석 체크) 완료해야 시작할 수 있다.
// 활동의 날짜와 진행 시간은 안내용 정보일 뿐, 참여 대상 판정과는 연결하지 않는다.

// 관리자가 선택한 회원 번호들(출석 체크 결과)
export async function rosterSet(act: Row): Promise<Set<string>> {
  const rows = await (await getStore()).list("Attendance");
  return new Set(rows.filter((r) => r.eventActivityId === act.id && r.present === "true").map((r) => r.memberId));
}

export type AttendanceState = { confirmed: boolean; confirmedAt: string; by: string };
const key = (aid: string) => `attendance:${aid}`;
export const attendanceState = (aid: string): Promise<AttendanceState> =>
  getSetting<AttendanceState>(key(aid), { confirmed: false, confirmedAt: "", by: "" });
export const saveAttendanceState = (aid: string, s: AttendanceState): Promise<void> => setSetting(key(aid), s);

// 이 회원이 활동에 참여할 수 있는지. selected 이면 관리자가 선택한 회원만 가능하다.
// (ev 는 호출하는 쪽 코드를 단순하게 두려고 받는다.)
export async function canJoin(cfg: TemplateConfig, act: Row, _ev: Row, memberId: string): Promise<boolean> {
  void _ev;
  if (cfg.participants !== "selected") return true;
  return (await rosterSet(act)).has(memberId);
}

// 참여 대상 회원 번호 집합. 전체 회원이면 null(제한 없음).
export async function joinSet(cfg: TemplateConfig, act: Row, _ev?: Row): Promise<Set<string> | null> {
  void _ev;
  return cfg.participants === "selected" ? rosterSet(act) : null;
}

// 사회자가 현장 진행(소개 열기, 고민 뽑기, 작성 열기)을 시작하기 전에 출석 체크가 끝났는지.
// 끝나지 않았다면 안내 문구를, 괜찮다면 null 을 돌려준다.
export async function onsiteGate(cfg: TemplateConfig, act: Row): Promise<string | null> {
  if (cfg.participants !== "selected") return null;
  const st = await attendanceState(act.id);
  if (!st.confirmed) return "활동 전에 출석 체크를 완료해 주세요. 활동 탭의 “출석 체크”에서 참여할 사람을 고르고 완료를 눌러 주세요.";
  return null;
}

// 팀 구성 등에서 쓰는 참여자 명단.
//  selected: 관리자가 선택한 회원
//  all     : 행사에 참석을 신청한 회원(없으면 전체 회원)
export async function participantPool(cfg: TemplateConfig, act: Row, ev: Row): Promise<{ members: Row[]; kind: "selected" | "attending" | "all" }> {
  const s = await getStore();
  const members = (await s.list("Members")).filter((m) => m.kind !== "회원대기");
  if (cfg.participants === "selected") {
    const set = await rosterSet(act);
    return { members: members.filter((m) => set.has(m.id)), kind: "selected" };
  }
  const applies = await s.list("EventApplies");
  const att = new Set(applies.filter((a) => a.eventId === ev.id && a.answer === "참석").map((a) => a.memberId));
  const attending = members.filter((m) => att.has(m.id));
  return attending.length > 0 ? { members: attending, kind: "attending" } : { members, kind: "all" };
}
