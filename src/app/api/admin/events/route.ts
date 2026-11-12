import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, guard } from "@/lib/api";
import { EVENT_TYPES } from "@/lib/schemas";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard(["events", "fees"]);
  if ("err" in g) return g.err;
  const s = await getStore();
  const [events, applies] = await Promise.all([s.list("Events"), s.list("EventApplies")]);
  const list = events.map((e) => {
    const a = applies.filter((x) => x.eventId === e.id);
    return {
      ...e,
      attend: a.filter((x) => x.answer === "참석").length,
      absent: a.filter((x) => x.answer === "불참").length,
      paid: a.filter((x) => x.answer === "참석" && x.paid === "true").length,
    };
  });
  return NextResponse.json({ events: list });
}

const body = z.object({
  type: z.enum(EVENT_TYPES),
  name: z.string().trim().min(1).max(80),
});

export async function POST(req: Request) {
  const g = await guard("events");
  if ("err" in g) return g.err;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("행사 유형과 이름을 입력해 주세요.");
  const s = await getStore();
  // 새 행사는 초안이고 회원에게 공개되지 않는다. 개요를 채운 뒤 '회원에게 전달'로 공개한다.
  const ev = await s.insert("Events", { ...parsed.data, status: "초안", published: "false" });
  return NextResponse.json({ event: ev });
}
