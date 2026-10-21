import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { COOKIE_NAME, getSessionUser } from "@/lib/auth";
import { DELETION_DELAY_DAYS } from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";

const REASON_MIN = 10;

/**
 * طلب حذف الحساب من الإعدادات:
 * - لازم سبب واضح (يظهر للأدمن في قسم «حذف الحسابات»).
 * - الحساب بيتجمد فورًا: الكوكي بتاع الجلسة بيتلغي.
 * - لو المستخدم سجل دخول تاني خلال ${DELETION_DELAY_DAYS} يوم، الطلب بيتلغى تلقائيًا
 *   (بيتعمل في /api/auth/google). وانتهاء المهلة بيوصل للاحذف النهائي (sweep).
 * - حسابات الأدمن محمية.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "سجّل الدخول الأول" }, { status: 401 });
  }
  if (session.isAdmin) {
    return NextResponse.json(
      { error: "حسابات الإدارة محمية — مينفعش تتم جدولة حذفها" },
      { status: 403 }
    );
  }

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const reason = String(body?.reason ?? "").trim();
  if (reason.length < REASON_MIN) {
    return NextResponse.json(
      { error: `اكتب سبب واضح لحذف الحساب (${REASON_MIN} حروف على الأقل)` },
      { status: 400 }
    );
  }

  const result = (await sql`
    UPDATE users
       SET deletion_requested_at = now(), deletion_reason = ${reason}
     WHERE id = ${session.id} AND is_admin = FALSE
    RETURNING deletion_requested_at
  `) as { deletion_requested_at: string }[];

  if (!result[0]) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }

  // سجل الطلب في admin_logs عشان الأدمن يشوف السبب وقرار الشرح
  try {
    await sql`
      INSERT INTO admin_logs (id, admin_id, admin_email, action, target_user_id, target_email, details)
      VALUES (
        ${randomUUID()}, 'system', 'system', 'request_account_deletion',
        ${session.id}, ${session.email},
        ${`طلب حذف حساب مع تعليق مهلة ${DELETION_DELAY_DAYS} يوم — سبب المستخدم: ${reason}`}
      )
    `;
  } catch (e) {
    console.error("log request_account_deletion error", e);
  }

  const requestedAt = result[0].deletion_requested_at;
  const deleteAfter = new Date(
    new Date(requestedAt).getTime() + DELETION_DELAY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // كسر الجلسة فورًا (تسجيل خروج صامت) — الحساب بقى مجمد
  const res = NextResponse.json({ ok: true, requestedAt, deleteAfter });
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
