import { randomInt } from "node:crypto";
import { activityKind, liveView, readConfig } from "./activities";
import { parseJson } from "./api";
import { liveRow } from "./rounds";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";

export type CapsuleCfg = {
  openAt: string; // 열림 일시(한국 시간, YYYY-MM-DDTHH:mm). 비어 있으면 아직 열리지 않는다.
  selfView: boolean; // 작성 직후 본인이 자기 목표를 볼 수 있는지(기본: 완전 봉인)
  log: { at: string; by: string; from: string; to: string }[]; // 열림 일시 변경 기록
};

export type CapsuleCtx = { act: Row; ev: Row; cfg: TemplateConfig };

export async function loadCapsule(aid: string, eventId?: string): Promise<CapsuleCtx | string> {
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid && (!eventId || a.eventId === eventId));
  const cfg = act ? readConfig(act.config) : null;
  const ev = act ? (await s.list("Events")).find((e) => e.id === act.eventId && (eventId ? true : e.published === "true")) : undefined;
  if (!act || !cfg || !ev) return "활동을 찾을 수 없어요.";
  if (activityKind(cfg) !== "capsule") return "타임캡슐 활동이 아니에요.";
  return { act, ev, cfg };
}

const key = (aid: string) => `capsule:${aid}`;
export const capsuleCfg = (aid: string): Promise<CapsuleCfg> =>
  getSetting<CapsuleCfg>(key(aid), { openAt: "", selfView: false, log: [] });
export const saveCapsuleCfg = (aid: string, c: CapsuleCfg): Promise<void> => setSetting(key(aid), c);

// 열림 여부는 서버 시각(한국 시간) 기준으로만 판단한다. 클라이언트 시계는 믿지 않는다.
export function isOpened(openAt: string, now = Date.now()): boolean {
  if (!openAt) return false;
  const t = Date.parse(`${openAt}:00+09:00`);
  return !Number.isNaN(t) && now >= t;
}

// 작성은 사회자가 작성 단계를 열어서 회원 화면이 '작성'으로 켜져 있을 때만 가능하다(템플릿 설정을 따른다).
export async function canWriteNow(cfg: TemplateConfig, aid: string): Promise<boolean> {
  const v = liveView(cfg, await liveRow(aid));
  return v.unlocked && v.memberScreen === "write";
}

export type Team = { id: string; name: string; memberIds: string[] };

export async function teams(aid: string): Promise<Team[]> {
  return (await (await getStore()).list("Teams"))
    .filter((t) => t.eventActivityId === aid)
    .map((t) => ({ id: t.id, name: t.name, memberIds: parseJson<string[]>(t.memberIds, []) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko", { numeric: true }));
}

// 팀 구성은 관리자가 '확인'을 눌러 배포하기 전까지 초안이다. 초안인 동안 회원에게는 팀이 보이지 않는다.
export type TeamsState = { published: boolean; publishedAt: string; by: string };
const tkey = (aid: string) => `teams:${aid}`;
export const teamsState = (aid: string): Promise<TeamsState> =>
  getSetting<TeamsState>(tkey(aid), { published: false, publishedAt: "", by: "" });
export const saveTeamsState = (aid: string, s: TeamsState): Promise<void> => setSetting(tkey(aid), s);

// 회원이 속한 팀(배포된 팀만)
export async function teamOf(aid: string, memberId: string): Promise<Team | null> {
  if (!(await teamsState(aid)).published) return null;
  return (await teams(aid)).find((t) => t.memberIds.includes(memberId)) ?? null;
}

export async function capsuleRows(aid: string): Promise<Row[]> {
  return (await (await getStore()).list("Capsules")).filter((c) => c.eventActivityId === aid);
}

/* ───── 팀 구성 ───── */
function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}
const ageOf = (g: string): number => {
  const n = parseInt(g, 10);
  return Number.isNaN(n) ? 999 : n;
};

// 팀 구성 방식
//  random : 랜덤 배정
//  mix    : 연령대 섞기(연령대 순으로 줄을 세운 뒤 뱀 모양으로 나눠서 세대가 섞이게 한다)
//  manual : 관리자 배정(빈 팀만 만들고 관리자가 직접 옮긴다)
export type TeamMode = "random" | "mix" | "manual";

export function makeTeams(members: Row[], count: number, mode: TeamMode): Row[][] {
  if (mode === "manual") return Array.from({ length: count }, () => []);
  const mixAge = mode === "mix";
  const list = shuffle(members);
  if (mixAge) list.sort((a, b) => ageOf(a.ageGroup) - ageOf(b.ageGroup));
  const out: Row[][] = Array.from({ length: count }, () => []);
  list.forEach((m, i) => {
    const row = Math.floor(i / count);
    const col = i % count;
    out[mixAge && row % 2 === 1 ? count - 1 - col : col].push(m);
  });
  return out;
}
