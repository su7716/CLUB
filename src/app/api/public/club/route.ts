import { NextResponse } from "next/server";
import { getSetting, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 로그인 전에 보이는 정보: 원우회 이름과 이름 목록(이름만). 회사·연락처 등은 내려주지 않는다.
export async function GET() {
  const s = await getStore();
  const clubName = await getSetting("clubName", "원우회");
  const members = (await s.list("Members"))
    .filter((m) => m.kind !== "회원대기")
    .map((m) => ({ id: m.id, name: m.name }));
  return NextResponse.json({ clubName, members });
}
