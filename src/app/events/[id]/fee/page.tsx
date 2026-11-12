"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, won } from "@/lib/client";

type Detail = {
  event: { name: string; fee: string; feeDeadline: string; account: string };
  apply: { answer: string; paid: boolean } | null;
  feeDue: boolean;
};

// 회비 안내. 입금을 관리자가 확인하면 알림이 사라지고 '입금 확인됨'으로 바뀐다.
export default function FeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<Detail>(`/api/events/${id}`).then((r) => {
      if (r.ok) setD(r.data);
      else if (r.status === 401) router.replace("/");
      else setError(r.error);
    });
  }, [id, router]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("복사하지 못했어요. 계좌번호를 길게 눌러 복사해 주세요.");
    }
  }

  if (error && !d) return <main className="app"><div className="msg bad" role="alert">{error}</div></main>;
  if (!d) return <main className="app"><p className="small">불러오는 중이에요…</p></main>;

  const e = d.event;
  const attending = d.apply?.answer === "참석";
  const paid = d.apply?.paid === true;

  return (
    <main className="app">
      <button className="btn white" type="button" style={{ width: "auto", alignSelf: "flex-start", minHeight: 44, fontSize: 16 }} onClick={() => router.push(`/events/${id}`)}>
        ‹ {e.name}
      </button>
      <div><span className={`pill ${paid ? "ok" : "bad"}`}>{paid ? "입금 확인됨 ✓" : "입금 확인 전"}</span></div>
      <h1 className="title">회비를 보내 주세요</h1>

      {!attending && <div className="msg info">참석을 신청하면 회비 안내가 열려요.</div>}
      {attending && !e.fee && <div className="msg info">이 행사는 정해진 회비가 없어요.</div>}

      {attending && e.fee && (
        <>
          <div className="card center"><span className="small">1인 회비</span><div className="title" style={{ fontSize: 40 }}>{won(e.fee)}</div></div>
          <div className="card">
            <span className="small">입금 계좌</span>
            <div style={{ font: "700 19px var(--body)" }}>{e.account || "계좌가 정해지면 알려 드려요"}</div>
            <div className="small">입금자명은 본인 이름으로 보내 주세요.</div>
          </div>
          {e.feeDeadline && <div className="card"><span className="small">입금 기한</span><div style={{ font: "700 19px var(--body)" }}>{e.feeDeadline}까지</div></div>}
          {paid
            ? <div className="msg info" style={{ background: "var(--green-bg)", color: "var(--green-t)" }}>입금이 확인됐어요. 회비 알림이 사라졌어요. 고맙습니다!</div>
            : <div className="msg info">입금하면 관리자가 확인해요. 확인이 끝나면 회비 알림이 사라져요.</div>}
          {error && <div className="msg bad" role="alert">{error}</div>}
          <div className="footer-actions">
            {e.account && !paid && <button className="btn" type="button" onClick={() => copy(e.account)}>{copied ? "복사했어요 ✓" : "계좌번호 복사"}</button>}
            <button className="btn white" type="button" onClick={() => router.push("/events")}>행사 목록으로</button>
          </div>
        </>
      )}
    </main>
  );
}
