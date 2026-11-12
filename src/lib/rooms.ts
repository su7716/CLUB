import { parseJson } from "./api";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";

// 숙박 방배정: 날짜별로 방을 만들고 투숙자를 배정한다. 같은 날짜에 한 사람은 한 방에만 들어간다.
export type Room = { id: string; date: string; name: string; capacity: number; memo: string; guests: string[] };

export const toRoom = (r: Row): Room => ({
  id: r.id, date: r.date, name: r.name, capacity: Number(r.capacity) || 0, memo: r.memo ?? "", guests: parseJson<string[]>(r.guests, []),
});

export async function rooms(eventId: string): Promise<Room[]> {
  return (await (await getStore()).list("Rooms")).filter((r) => r.eventId === eventId).map(toRoom);
}

export const validDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));

// 행사 기간에서 숙박하는 날짜(시작일부터 종료일 전날까지). 당일 행사면 시작일만 돌려준다.
export function nightsOf(startsAt: string, endsAt: string): string[] {
  const s = startsAt.slice(0, 10);
  const e = endsAt.slice(0, 10);
  if (!validDate(s)) return [];
  if (!validDate(e) || e <= s) return [s];
  const out: string[] = [];
  for (let t = Date.parse(s); t < Date.parse(e) && out.length < 31; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// 방 이름을 비워 두면 그 날짜에 안 쓰인 번호로 "객실 1", "객실 2"…를 붙인다.
export function suggestRoomName(all: Room[], date: string): string {
  const same = all.filter((r) => r.date === date);
  const used = new Set(same.map((r) => r.name));
  let n = same.length + 1;
  while (used.has(`객실 ${n}`)) n++;
  return `객실 ${n}`;
}

// 같은 날짜의 다른 방에 이미 있는 사람, 정원 초과, 중복을 걸러 안내 문구를 돌려준다.
export function roomConflict(all: Room[], next: Room, names: Map<string, string>): string | null {
  if (new Set(next.guests).size !== next.guests.length) return "같은 사람이 두 번 들어갔어요.";
  if (next.guests.length > next.capacity) return `정원은 ${next.capacity}명이에요. 투숙자를 줄이거나 정원을 늘려 주세요.`;
  for (const o of all) {
    if (o.id === next.id || o.date !== next.date) continue;
    const hit = next.guests.find((g) => o.guests.includes(g));
    if (hit) return `${names.get(hit) ?? "회원"} 님이 같은 날짜의 다른 방(${o.name})에 이미 있어요.`;
  }
  return null;
}

const key = (eventId: string) => `rooms:${eventId}`;
export type RoomState = { published: boolean; publishedAt: string };
export const roomState = (eventId: string): Promise<RoomState> => getSetting<RoomState>(key(eventId), { published: false, publishedAt: "" });
export const saveRoomState = (eventId: string, s: RoomState): Promise<void> => setSetting(key(eventId), s);
