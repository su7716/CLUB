"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { AdminGate } from "@/components/AdminGate";
import { CarpoolPanel } from "@/components/CarpoolPanel";
import { EventActivities } from "@/components/EventActivities";
import { EventItems } from "@/components/EventItems";
import { GroupsPanel } from "@/components/GroupsPanel";
import { RoomsPanel } from "@/components/RoomsPanel";
import { api, won } from "@/lib/client";

type Ev = {
  id: string; type: string; name: string; startsAt: string; endsAt: string; place: string; booking: string;
  status: string; published: string; fee: string; feeDeadline: string; account: string;
};
type Row = { memberId: string; name: string; answer: string; days: string; paid: boolean; paidAt: string };

const TABS = [
  { key: "over", label: "개요" },
  { key: "apply", label: "참석 신청" },
  { key: "fee", label: "회비" },
  { key: "act", label: "활동" },
  { key: "sched", label: "일정" },
  { key: "prep", label: "준비 목록" },
  { key: "cost", label: "비용" },
  { key: "group", label: "조편성" },
  { key: "car", label: "카풀" },
  { key: "room", label: "숙박·방배정" },
];
const dayText = (days: string) =>
  days ? days.split(",").map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`).join(", ") : "";

function Detail({ id }: { id: string }) {
  const [ev, setEv] = useState<Ev | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState("over");
  const [msg, setMsg] = useState<{ tone: "bad" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [canEditActs, setCanEditActs] = useState(false);

  useEffect(() => {
    api<{ perms: string[] }>("/api/me").then((r) => {
      if (r.ok) setCanEditActs(r.data.perms.includes("all") || r.data.perms.includes("activities"));
    });
  }, []);

  const load = useCallback(async () => {
    const r = await api<{ event: Ev; rows: Row[] }>(`/api/admin/events/${id}`);
    if (r.ok) {
      setEv(r.data.event);
      setRows(r.data.rows);
    } else setMsg({ tone: "bad", text: r.error });
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  if (!ev) return msg ? <div className="msg bad" role="alert">{msg.text}</div> : <p className="small">불러오는 중이에요…</p>;

  const set = (k: keyof Ev, v: string) => setEv({ ...ev, [k]: v });

  async function save(published?: boolean) {
    if (!ev) return;
    setBusy(true);
    setMsg(null);
    const { id: _id, type: _t, published: _p, ...fields } = ev;
    void _id; void _t; void _p;
    const r = await api(`/api/admin/events/${id}`, {
      method: "PATCH",
      body: { ...fields, ...(published === undefined ? {} : { published }) },
    });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: published === true ? "회원에게 전달했어요. 이제 회원 화면에 보여요." : published === false ? "공개를 취소했어요." : "저장했어요." });
    load();
  }

  async function pay(memberId: string, paid: boolean) {
    const r = await api(`/api/admin/events/${id}/pay`, { body: { memberId, paid } });
    if (!r.ok) return setMsg({ tone: "bad", text: r.error });
    setMsg({ tone: "info", text: paid ? "입금을 확인했어요. 회원 화면의 회비 알림이 사라져요." : "입금 확인을 취소했어요." });
    load();
  }

  const attend = rows.filter((r) => r.answer === "참석");
  const absent = rows.filter((r) => r.answer === "불참");
  const noAns = rows.filter((r) => r.answer === "");
  const paid = attend.filter((r) => r.paid);
  const feeNum = Number(ev.fee) || 0;

  return (
    <>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <Link href="/admin/events" className="mini" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>‹ 행사 목록</Link>
        <span className="pill blue">{ev.type}</span>
        <h1 className="title grow" style={{ fontSize: 24 }}>{ev.name}</h1>
        <span className={`pill ${ev.published === "true" ? "ok" : "gray"}`}>{ev.published === "true" ? "회원에게 공개 중" : "초안"}</span>
      </div>

      <div className="tabsx" role="tablist" aria-label="행사 관리 메뉴">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {msg && <div className={`msg ${msg.tone}`} role={msg.tone === "bad" ? "alert" : "status"}>{msg.text}</div>}

      {tab === "over" && (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="grid2">
            <div><label className="l" htmlFor="o-name">행사 이름</label><input id="o-name" className="field" value={ev.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-place">장소</label><input id="o-place" className="field" value={ev.place} onChange={(e) => set("place", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-start">시작 일시</label><input id="o-start" className="field" type="datetime-local" value={ev.startsAt} onChange={(e) => set("startsAt", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-end">끝나는 일시</label><input id="o-end" className="field" type="datetime-local" value={ev.endsAt} onChange={(e) => set("endsAt", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-book">예약 정보</label><input id="o-book" className="field" value={ev.booking} onChange={(e) => set("booking", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-status">진행 상태</label><input id="o-status" className="field" value={ev.status} onChange={(e) => set("status", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-fee">1인 회비 (숫자만, 없으면 비워 두기)</label><input id="o-fee" className="field" inputMode="numeric" value={ev.fee} onChange={(e) => set("fee", e.target.value.replace(/\D/g, ""))} /></div>
            <div><label className="l" htmlFor="o-dl">입금 기한</label><input id="o-dl" className="field" type="date" value={ev.feeDeadline} onChange={(e) => set("feeDeadline", e.target.value)} /></div>
            <div><label className="l" htmlFor="o-acc">입금 계좌</label><input id="o-acc" className="field" value={ev.account} onChange={(e) => set("account", e.target.value)} /></div>
          </div>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button className="btn white" type="submit" disabled={busy} style={{ width: "auto", minWidth: 160 }}>임시 저장</button>
            <button className="btn" type="button" disabled={busy} style={{ width: "auto", minWidth: 200 }} onClick={() => save(true)}>
              {ev.published === "true" ? "저장하고 계속 공개" : "회원에게 전달"}
            </button>
            {ev.published === "true" && <button className="btn red" type="button" disabled={busy} style={{ width: "auto", minWidth: 160 }} onClick={() => save(false)}>공개 취소</button>}
          </div>
          <span className="small">계좌번호는 참석을 신청한 회원에게만 보여요.</span>
        </form>
      )}

      {tab === "act" && <EventActivities eventId={id} canEdit={canEditActs} />}
      {tab === "sched" && <EventItems eventId={id} kind="schedule" canEdit />}
      {tab === "prep" && <EventItems eventId={id} kind="prep" canEdit />}
      {tab === "cost" && <EventItems eventId={id} kind="costs" canEdit />}
      {tab === "group" && <GroupsPanel eventId={id} canEdit />}
      {tab === "car" && <CarpoolPanel eventId={id} canEdit />}
      {tab === "room" && <RoomsPanel eventId={id} canEdit />}

      {tab === "apply" && (
        <>
          <div className="cards">
            <div className="card"><span className="small">참석</span><div className="big" style={{ color: "var(--green-t)" }}>{attend.length}명</div></div>
            <div className="card"><span className="small">불참</span><div className="big">{absent.length}명</div></div>
            <div className="card"><span className="small">미응답</span><div className="big" style={{ color: "var(--orange-t)" }}>{noAns.length}명</div></div>
          </div>
          <div className="tblw">
            <table className="tbl" style={{ minWidth: 480 }}>
              <thead><tr><th>이름</th><th>신청</th><th>참석 날짜</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.memberId}>
                    <td><b>{r.name}</b></td>
                    <td><span className={`pill ${r.answer === "참석" ? "ok" : r.answer === "불참" ? "gray" : "warn"}`}>{r.answer || "미응답"}</span></td>
                    <td className="num">{dayText(r.days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "fee" && (
        <>
          <div className="cards">
            <div className="card"><span className="small">1인 회비</span><div className="big">{feeNum ? won(feeNum) : "미정"}</div></div>
            <div className="card"><span className="small">입금 완료</span><div className="big" style={{ color: "var(--green-t)" }}>{paid.length}명</div><span className="small">{won(paid.length * feeNum)} / {won(attend.length * feeNum)}</span></div>
            <div className="card"><span className="small">미입금</span><div className="big" style={{ color: "var(--red-t)" }}>{attend.length - paid.length}명</div></div>
          </div>
          <span className="small">“입금 확인”을 누르면 그 회원 화면의 회비 알림이 바로 사라져요. 미입금 회원에게는 알림이 계속 보여요.</span>
          {attend.length === 0 && <div className="msg info">아직 참석을 신청한 회원이 없어요.</div>}
          {attend.length > 0 && (
            <div className="tblw">
              <table className="tbl" style={{ minWidth: 520 }}>
                <thead><tr><th>이름</th><th>금액</th><th>입금 상태</th><th>확인일</th><th></th></tr></thead>
                <tbody>
                  {attend.map((r) => (
                    <tr key={r.memberId}>
                      <td><b>{r.name}</b></td>
                      <td className="num">{feeNum ? feeNum.toLocaleString("ko-KR") : "-"}</td>
                      <td><span className={`pill ${r.paid ? "ok" : "warn"}`}>{r.paid ? "입금" : "미입금"}</span></td>
                      <td className="num">{r.paidAt}</td>
                      <td><button className="mini" type="button" onClick={() => pay(r.memberId, !r.paid)}>{r.paid ? "취소" : "입금 확인"}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function EventDetailAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AdminGate mode="events" need={["events", "fees"]} active="/admin/events"><Detail id={id} /></AdminGate>;
}
