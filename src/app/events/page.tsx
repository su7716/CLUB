"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { api, fmtWhen } from "@/lib/client";

type Ev = {
  id: string;
  type: string;
  name: string;
  startsAt: string;
  endsAt: string;
  place: string;
  status: string;
  myAnswer: string;
  feeDue: boolean;
};
type Me = { name: string; perms: string[]; admin: boolean; consent: boolean };

const TYPE_TONE: Record<string, string> = { 워크숍: "blue", 전체정기모임: "ok", 소모임: "warn" };

export default function EventsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState("");
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const m = await api<Me>("/api/me");
      if (!m.ok) {
        if (m.status === 401) router.replace("/");
        else setError(m.error);
        return;
      }
      setMe(m.data);
      const e = await api<{ events: Ev[] }>("/api/events");
      if (e.ok) setEvents(e.data.events);
      else setError("행사 목록을 불러오지 못했어요. 화면을 새로 고쳐 주세요.");
    })();
  }, [router]);

  async function agree() {
    setBusy(true);
    const r = await api("/api/me/consent", { method: "POST", body: {} });
    setBusy(false);
    if (r.ok && me) setMe({ ...me, consent: true });
    else setError(r.ok ? "" : r.error);
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} });
    router.push("/");
  }

  const locked = me ? !me.consent : true;

  return (
    <main className="app">
      <div className="row">
        <h1 className="title grow" style={{ fontSize: 22 }}>
          {me ? `${me.name} 대표님, 반갑습니다` : "예정된 모임과 행사"}
        </h1>
        {me && me.perms.length > 0 && (
          <button className="btn white" type="button" style={{ width: "auto", minHeight: 44, fontSize: 16 }} onClick={() => router.push("/admin")}>
            관리자
          </button>
        )}
      </div>
      <p className="small" style={{ margin: 0 }}>예정된 모임과 행사</p>

      {error && <div className="msg bad" role="alert">{error}</div>}
      {!events && !error && <p className="small">불러오는 중이에요…</p>}
      {events && events.length === 0 && <div className="msg info">아직 예정된 행사가 없어요.</div>}
      {declined && <div className="msg info">동의하지 않으면 활동에 참여할 수 없어요. 아래에서 다시 동의할 수 있어요.</div>}

      <div className="pick">
        {events?.map((e) => (
          <button key={e.id} className="opt" type="button" disabled={locked} onClick={() => router.push(`/events/${e.id}`)}>
            <span className={`pill ${TYPE_TONE[e.type] ?? "gray"}`}>{e.type}</span>
            <span className="name">{e.name}</span>
            <span className="small">{fmtWhen(e.startsAt, e.endsAt, e.place)}</span>
            {e.myAnswer === "" && e.startsAt && <span className="pill warn">참석 신청 필요</span>}
            {e.myAnswer === "불참" && <span className="pill gray">불참으로 알림</span>}
            {e.feeDue && <span className="pill bad">₩ 회비 미입금</span>}
          </button>
        ))}
      </div>

      {me?.consent && (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <button className="btn white" type="button" style={{ flex: "1 1 160px" }} onClick={() => router.push("/profiles")}>회원 프로필 북</button>
          <button className="btn white" type="button" style={{ flex: "1 1 160px" }} onClick={() => router.push("/club")}>조직도·회칙</button>
        </div>
      )}

      <div className="footer-actions">
        {declined && (
          <button className="btn" type="button" onClick={() => setDeclined(false)}>동의 안내 다시 보기</button>
        )}
        <button className="btn white" type="button" onClick={logout}>로그아웃</button>
      </div>

      {me && !me.consent && !declined && (
        <Sheet title="개인정보 안내">
          <p style={{ margin: 0 }}>
            작성하신 내용 중 본인이 공개로 선택한 부분은 원우회 회원들에게 보여집니다. 언제든 수정·삭제할 수 있습니다.
          </p>
          <button className="btn" type="button" disabled={busy} onClick={agree}>동의합니다</button>
          <button className="btn white" type="button" onClick={() => setDeclined(true)}>동의하지 않음</button>
        </Sheet>
      )}
    </main>
  );
}
