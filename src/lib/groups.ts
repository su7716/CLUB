import { parseJson } from "./api";
import { getStore } from "./store";
import type { Row } from "./store/types";

export type GTeam = { name: string; memberIds: string[] };

export async function loadGrouping(eventId: string, gid: string): Promise<{ g: Row; ev: Row } | null> {
  const s = await getStore();
  const [gs, evs] = await Promise.all([s.list("Groupings"), s.list("Events")]);
  const g = gs.find((x) => x.id === gid && x.eventId === eventId);
  const ev = evs.find((e) => e.id === eventId);
  return g && ev ? { g, ev } : null;
}

export const gTeams = (g: Row): GTeam[] => parseJson<GTeam[]>(g.teams, []);

// 조편성에 쓸 사람: 행사에 참석을 신청한 회원, 없으면(신청 전) 전체 회원
export async function groupPool(ev: Row): Promise<{ members: Row[]; kind: "attending" | "all" }> {
  const s = await getStore();
  const [members, applies] = await Promise.all([s.list("Members"), s.list("EventApplies")]);
  const live = members.filter((m) => m.kind !== "회원대기");
  const att = new Set(applies.filter((a) => a.eventId === ev.id && a.answer === "참석").map((a) => a.memberId));
  const attending = live.filter((m) => att.has(m.id));
  return attending.length > 0 ? { members: attending, kind: "attending" } : { members: live, kind: "all" };
}
