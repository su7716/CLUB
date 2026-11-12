import { NextResponse } from "next/server";
import { MAX_ADMINS, bad, guard } from "@/lib/api";
import { can } from "@/lib/auth";
import { getStore } from "@/lib/store";
import { memberBody } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  const parsed = memberBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("입력값을 확인해 주세요.");
  const d = parsed.data;

  const s = await getStore();
  const all = await s.list("Members");
  const cur = all.find((m) => m.id === id);
  if (!cur) return bad("회원을 찾을 수 없어요.", 404);

  const nextPerms = d.perms.join("|");
  if (nextPerms !== cur.perms) {
    if (!can(g.s, "all")) return bad("관리자 권한은 모든 권한 관리자만 바꿀 수 있어요.", 403);
    const adminsAfter = all.filter((m) => (m.id === id ? nextPerms : m.perms)).length;
    if (adminsAfter > MAX_ADMINS) return bad(`관리자는 최대 ${MAX_ADMINS}명까지예요.`);
    // '모든 권한' 관리자가 아무도 없어지면 아무도 권한을 줄 수 없으므로 막는다.
    const allAfter = all.filter((m) => (m.id === id ? nextPerms : m.perms).split("|").includes("all")).length;
    if (allAfter === 0) return bad("모든 권한 관리자는 한 명 이상 있어야 해요.");
  }

  const row = await s.update("Members", id, { ...d, perms: nextPerms });
  return NextResponse.json({ member: row });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard("members");
  if ("err" in g) return g.err;
  const { id } = await ctx.params;
  if (id === g.s.mid) return bad("내 계정은 지울 수 없어요.");
  const s = await getStore();
  const cur = (await s.list("Members")).find((m) => m.id === id);
  if (!cur) return bad("회원을 찾을 수 없어요.", 404);
  if (cur.perms) return bad("관리자는 먼저 권한을 없앤 뒤 지울 수 있어요.");
  await s.remove("Members", id);
  return NextResponse.json({ ok: true });
}
