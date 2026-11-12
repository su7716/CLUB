import { NextResponse } from "next/server";
import { guard } from "@/lib/api";
import { getSetting, getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// 회원 프로필 북. 공개로 승인된 소개만 보인다(2진실 1거짓, 인터뷰, 고민, 타임캡슐, 생년월일 등은 절대 포함하지 않는다).
// 공개 시점 전에는 별칭으로만 보여 주고, 미작성 회원의 이름은 밝히지 않는다(이름이 남으면 별칭의 주인을 추측하기 쉬워진다).
// 공개 시점 이후에는 실명으로 보이고 미작성 회원도 "미작성"으로 표시한다.
export async function GET() {
  const g = await guard();
  if ("err" in g) return g.err;
  const s = await getStore();
  const [members, profiles] = await Promise.all([s.list("Members"), s.list("Profiles")]);
  const revealAt = await getSetting<string>("profileRevealAt", "");
  const revealed = revealAt !== "" && Date.now() >= Date.parse(`${revealAt}:00+09:00`);

  const live = members.filter((m) => m.kind !== "회원대기");
  const authored = live.flatMap((m) => {
    const p = profiles.find((x) => x.memberId === m.id && x.introStatus === "approved");
    return p ? [{ id: p.id, alias: p.alias, name: revealed ? m.name : "", mine: m.id === g.s.mid }] : [];
  });
  const missing = live.filter((m) => !profiles.some((x) => x.memberId === m.id && x.introStatus === "approved"));

  return NextResponse.json({
    revealed,
    revealAt,
    items: authored.sort((a, b) => (revealed ? a.name.localeCompare(b.name, "ko") : a.alias.localeCompare(b.alias, "ko"))),
    missingCount: missing.length,
    missing: revealed ? missing.map((m) => ({ name: m.name })) : [],
  });
}
