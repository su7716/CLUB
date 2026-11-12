"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

type Data = {
  schedule: { at: string; title: string }[];
  groups: { title: string; team: string; members: string[] }[];
  rooms: { published: boolean; mine: { date: string; name: string; memo: string; mates: string[] }[] };
  carpool: { published: boolean; mine: { name: string; plate: string; leg: string; from: string; to: string; departAt: string; arriveAt: string; driver: string; iDrive: boolean; riders: string[]; seats: number }[] };
};

const when = (at: string) => (at.includes("T") ? `${Number(at.slice(5, 7))}/${Number(at.slice(8, 10))} ${at.slice(11, 16)}` : at);

// 회원이 보는 행사 정보: 일정, 내 조편성(배포된 것), 내 카풀(배포된 것)
export function MineInfo({ eventId }: { eventId: string }) {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const r = await api<Data>(`/api/events/${eventId}/mine`);
      if (!stop && r.ok) setD(r.data);
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [eventId]);

  if (!d) return null;
  return (
    <>
      {d.schedule.length > 0 && (
        <section className="card" aria-label="일정">
          <b style={{ font: "400 19px var(--display)" }}>일정</b>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {d.schedule.map((s, i) => (
              <div key={i} className="row"><b className="num" style={{ minWidth: 92 }}>{when(s.at)}</b><span>{s.title}</span></div>
            ))}
          </div>
        </section>
      )}
      {d.groups.map((g, i) => (
        <section key={i} className="card" aria-label={`내 조 ${g.title}`}>
          <b style={{ font: "400 19px var(--display)" }}>{g.title}</b>
          <div><span className="pill blue">{g.team}</span></div>
          <div className="small">{g.members.join(", ")}</div>
        </section>
      ))}
      {d.rooms?.published && d.rooms.mine.length > 0 && (
        <section className="card" aria-label="내 숙소" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: "400 19px var(--display)" }}>내 숙소</b>
          {d.rooms.mine.map((r, i) => (
            <div key={i} style={{ borderTop: i ? "2px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
              <div className="row" style={{ flexWrap: "wrap" }}><span className="pill ok">{Number(r.date.slice(5, 7))}/{Number(r.date.slice(8, 10))} 숙박</span><b>{r.name}</b></div>
              {r.memo && <div className="small">{r.memo}</div>}
              <div className="small">같은 방: {r.mates.length ? r.mates.join(", ") : "혼자 써요"}</div>
            </div>
          ))}
        </section>
      )}
      {d.carpool.published && d.carpool.mine.length > 0 && (
        <section className="card" aria-label="내 카풀" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <b style={{ font: "400 19px var(--display)" }}>내 카풀</b>
          {d.carpool.mine.map((c, i) => (
            <div key={i} style={{ borderTop: i ? "2px solid var(--line)" : undefined, paddingTop: i ? 8 : 0 }}>
              <div className="row" style={{ flexWrap: "wrap" }}><b>{c.name}</b><span className="pill ok">{c.leg}</span><span className="pill gray">{c.iDrive ? "내가 운전해요" : "동승"}</span></div>
              <div>운전자: <b>{c.driver || "미정"}</b>{c.plate ? ` · 차량번호 ${c.plate}` : ""}</div>
              <div className="small">출발: {c.from || "장소 미정"}{c.departAt ? ` · ${when(c.departAt)} 예상` : ""}</div>
              <div className="small">도착: {c.to || "장소 미정"}{c.arriveAt ? ` · ${when(c.arriveAt)} 예상` : ""}</div>
              <div className="small">동승자: {c.riders.length ? c.riders.join(", ") : "없음"}</div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
