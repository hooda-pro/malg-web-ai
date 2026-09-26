import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/** حظر أو فك حظر حساب مستخدم */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const banned = Boolean(body?.banned);

  if (params.id === guard.admin.id) {
    return NextResponse.json({ error: "مينفعش تحظر حسابك الإداري بنفسك" }, { status: 400 });
  }

  const targetRows = (await sql`
    SELECT id, email, display_name, is_admin, is_banned FROM users WHERE id = ${params.id}
  `) as { id: string; email: string; display_name: string; is_admin: boolean; is_banned: boolean }[];
  const target = targetRows[0];

  if (!target) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }
  if (target.is_admin) {
    return NextResponse.json(
      { error: "مينفعش حظر حساب أدمن — الحسابات الإدارية محمية" },
      { status: 400 }
    );
  }
  if (target.is_banned === banned) {
    return NextResponse.json({ error: banned ? "الحساب متحظر بالفعل" : "الحساب مش متحظر أصلاً" }, { status: 400 });
  }

  if (banned) {
    await sql`UPDATE users SET is_banned = TRUE, banned_at = now() WHERE id = ${params.id}`;
  } else {
    await sql`UPDATE users SET is_banned = FALSE, banned_at = NULL WHERE id = ${params.id}`;
  }

  await logAdminAction(
    guard.admin,
    banned ? "ban_user" : "unban_user",
    target.id,
    target.email,
    banned ? `حظر حساب: ${target.display_name}` : `فك حظر حساب: ${target.display_name}`
  );

  return NextResponse.json({ ok: true, banned });
}