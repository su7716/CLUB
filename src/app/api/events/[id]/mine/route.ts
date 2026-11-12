import { NextResponse } from "next/server";
import { bad, guard } from "@/lib/api";
import { carpoolState, cars } from "@/lib/carpool";
import { roomState, rooms } from "@/lib/rooms";
import { gTeams } from "@/lib/groups";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원이 보는 행사 정보: 일정, 내 조편성(배포된 것만), 내 카풀(배포된 것만).
// 준비 목록과 비용은 관리자만 본다.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard();
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const s = await getStore();
  const [events, sched, groups, members, state, all] = await Promise.all([
    s.list("Events"), s.list("EventSchedule"), s.list("Groupings"), s.list("Members"), carpoolState(id), cars(id),
  ]);
  const ev = events.find((e) => e.id === id && e.published === "true");
  if (!ev) return bad("행사를 찾을 수 없어요.", 404);
  const nm = (mid: string) => members.find((m) => m.id === mid)?.name ?? "";

  const myGroups = groups
    .filter((x) => x.eventId === id && x.published === "true")
    .flatMap((x) => {
      const t = gTeams(x).find((y) => y.memberIds.includes(g.s.mid));
      return t ? [{ title: x.title, team: t.name, members: t.memberIds.map(nm) }] : [];
    });

  const myCars = state.published
    ? all
        .filter((c) => c.driverId === g.s.mid || c.riders.includes(g.s.mid))
        .map((c) => ({
          name: c.name, plate: c.plate, leg: c.leg, from: c.from, to: c.to, departAt: c.departAt, arriveAt: c.arriveAt, driver: nm(c.driverId), iDrive: !!c.driverId && c.driverId === g.s.mid,
          riders: c.riders.map(nm), seats: c.seats,
        }))
    : [];

  const [roomSt, allRooms] = await Promise.all([roomState(id), rooms(id)]);
  const myRooms = roomSt.published
    ? allRooms
        .filter((r) => r.guests.includes(g.s.mid))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((r) => ({ date: r.date, name: r.name, memo: r.memo, mates: r.guests.filter((x) => x !== g.s.mid).map(nm) }))
    : [];

  return NextResponse.json({
    rooms: { published: roomSt.published, mine: myRooms },
    schedule: sched.filter((r) => r.eventId === id).sort((a, b) => a.at.localeCompare(b.at)).map((r) => ({ at: r.at, title: r.title })),
    groups: myGroups,
    carpool: { published: state.published, mine: myCars },
  });
}
