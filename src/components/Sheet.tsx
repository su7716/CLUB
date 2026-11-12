"use client";

// 화면 아래에서 올라오는 선택 창 (졸업여행 날짜, 개인정보 동의 등)
export function Sheet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet">
        <h2 className="title" style={{ fontSize: 23 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
