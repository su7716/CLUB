"use client";

// 화면에서 서버를 부르는 공통 함수. 실패해도 예외 대신 { ok:false, error } 로 돌려준다.
export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export async function api<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  try {
    const r = await fetch(path, {
      method: init?.method ?? (init?.body ? "POST" : "GET"),
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: (data as { error?: string }).error ?? "처리하지 못했어요." };
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, status: 0, error: "연결이 불안정해요. 잠시 후 다시 눌러 주세요." };
  }
}

export function fmtWhen(startsAt: string, endsAt: string, place: string): string {
  if (!startsAt) return "날짜가 정해지면 알려 드려요";
  const d = new Date(startsAt);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const range = endsAt ? `${md}~${new Date(endsAt).getDate()}` : md;
  return place ? `${range} · ${place}` : range;
}

export function won(n: string | number): string {
  const v = Number(n);
  return Number.isFinite(v) ? `${v.toLocaleString("ko-KR")}원` : "";
}
