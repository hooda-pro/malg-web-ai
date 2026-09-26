import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/** تغيير كلمة مرور حساب الأدمن الحالي */
export async function POST(req: NextRequest) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const currentPassword = String(body?.currentPassword || "");
  const newPassword = String(body?.newPassword || "");

  if (newPassword.length < 8) {
    return NextResponse.json(
      { error: "كلمة المرور الجديدة لازم تكون 8 خانات على الأقل" },
      { status: 400 }
    );
  }

  const rows = (await sql`
    SELECT password_hash FROM users WHERE id = ${guard.admin.id}
  `) as { password_hash: string }[];
  const hash = rows[0]?.password_hash;
  if (!hash) {
    return NextResponse.json({ error: "حساب الأدمن غير موجود" }, { status: 404 });
  }

  const valid = await bcrypt.compare(currentPassword, hash);
  if (!valid) {
    return NextResponse.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 401 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${guard.admin.id}`;

  await logAdminAction(guard.admin, "change_password", guard.admin.id, guard.admin.email, null);

  return NextResponse.json({ ok: true });
}