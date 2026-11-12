import { parseJson } from "./api";
import { getSetting, getStore, setSetting } from "./store";
import type { Row } from "./store/types";

export const LEGS = ["왕복", "갈 때", "올 때"] as const;
export type Leg = (typeof LEGS)[number];

// 구간: 왕복은 갈 때와 올 때를 모두 포함한다.
const legsOf = (leg: string): ("go" | "back")[] => (leg === "왕복" ? ["go", "back"] : leg === "갈 때" ? ["go"] : ["back"]);

export type Car = {
  id: string; name: string; plate: string; leg: Leg; driverId: string; seats: number; // 이름 외 운전자·차량번호·장소·시간은 선택 입력
  from: string; to: string; departAt: string; arriveAt: string; // 출발·도착 장소와 예상 시간
  riders: string[];
};

export const toCar = (r: Row): Car => ({
  id: r.id, name: r.name ?? "", plate: r.plate ?? "", leg: r.leg as Leg, driverId: r.driverId, seats: Number(r.seats) || 0, from: r.from, to: r.to, departAt: r.departAt, arriveAt: r.arriveAt,
  riders: parseJson<string[]>(r.riders, []),
});

// 도착 예상 시간이 출발 시간보다 빠르면 안 된다.
export function timeOrder(departAt: string, arriveAt: string): string | null {
  return departAt && arriveAt && arriveAt < departAt ? "도착 예상 시간이 출발 시간보다 빠를 수 없어요." : null;
}

// 그룹명을 비워 두면 "카풀 1조", "카풀 2조"처럼 안 쓰인 번호로 임의의 이름을 붙인다. 관리자가 나중에 바꿀 수 있다.
export function suggestName(all: Car[]): string {
  const used = new Set(all.map((c) => c.name));
  let n = all.length + 1;
  while (used.has(`카풀 ${n}조`)) n++;
  return `카풀 ${n}조`;
}

export async function cars(eventId: string): Promise<Car[]> {
  return (await (await getStore()).list("Carpools")).filter((c) => c.eventId === eventId).map(toCar);
}

// 한 사람이 같은 구간에 두 대에 타거나 운전할 수 없다. 문제가 있으면 안내 문구를 돌려준다.
export function conflict(all: Car[], next: Car, names: Map<string, string>): string | null {
  const others = all.filter((c) => c.id !== next.id);
  const people = [...(next.driverId ? [next.driverId] : []), ...next.riders];
  if (new Set(people).size !== people.length) return "운전자와 동승자가 겹쳐요.";
  if (next.riders.length > next.seats) return `좌석은 ${next.seats}개예요. 동승자를 줄이거나 좌석 수를 늘려 주세요.`;
  for (const pid of people) {
    for (const o of others) {
      if (![o.driverId, ...o.riders].includes(pid)) continue;
      const overlap = legsOf(o.leg).some((l) => legsOf(next.leg).includes(l));
      if (overlap) return `${names.get(pid) ?? "회원"} 님이 같은 구간의 다른 차량에 이미 있어요.`;
    }
  }
  return null;
}

const key = (eventId: string) => `carpool:${eventId}`;
export type CarpoolState = { published: boolean; publishedAt: string };
export const carpoolState = (eventId: string): Promise<CarpoolState> =>
  getSetting<CarpoolState>(key(eventId), { published: false, publishedAt: "" });
export const saveCarpoolState = (eventId: string, s: CarpoolState): Promise<void> => setSetting(key(eventId), s);

// 구간별로 아직 차가 없는 참석자(운전자나 동승자로 들어가지 않은 사람)
export function freeFor(all: Car[], applicants: string[]): { go: string[]; back: string[] } {
  const used = { go: new Set<string>(), back: new Set<string>() };
  for (const c of all) for (const pid of [c.driverId, ...c.riders].filter(Boolean)) for (const l of legsOf(c.leg)) used[l].add(pid);
  return { go: applicants.filter((p) => !used.go.has(p)), back: applicants.filter((p) => !used.back.has(p)) };
}

// 자동 배정: 빈 좌석에 아직 차가 없는 참석자를 차례로 채운다(왕복 차량은 두 구간 모두 비어 있는 사람만).
export async function autoAssign(eventId: string, applicants: string[]): Promise<number> {
  const s = await getStore();
  const all = await cars(eventId);
  let added = 0;
  for (const car of all) {
    const free = freeFor(all, applicants);
    const need = legsOf(car.leg);
    const pool = need.length === 2 ? free.go.filter((p) => free.back.includes(p)) : need[0] === "go" ? free.go : free.back;
    const room = car.seats - car.riders.length;
    const take = pool.filter((p) => p !== car.driverId && !car.riders.includes(p)).slice(0, Math.max(0, room));
    if (take.length === 0) continue;
    car.riders = [...car.riders, ...take];
    await s.update("Carpools", car.id, { riders: JSON.stringify(car.riders) });
    added += take.length;
  }
  return added;
}
