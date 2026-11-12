"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AdminGate } from "@/components/AdminGate";

function Go() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/events");
  }, [router]);
  return <p className="small">이동 중이에요…</p>;
}

// 관리자 입구: 2차 비밀번호를 통과하면 행사진행 화면으로 간다.
export default function AdminHome() {
  return <AdminGate><Go /></AdminGate>;
}
