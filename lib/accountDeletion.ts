import { randomUUID } from "crypto";
import { sql } from "./db";

/**
 * نظام حذف الحساب بمهلة (Grace period):
 * - المستخدم يطلب حذف حسابه من الإعدادات مع كتابة سبب حتى لو لوج الامتي حذف.
 * - العملية بتتعطل 30 يوم؛ خلال المهلة لو سجل دخول بأي طريقة (جوجل) الطلب بيتلغى تلقائيًا.
 * - لو مهلة الـ 30 يوم انتهت ولسه مجدول، بيتحذف نهائيًا مع كل بياناته (sweep في /api/auth/me و /api/auth/google و قايمة حذف الحسابات للأدمن).
 * - حسابات الأدمن محمية تمامًا من ده النظام.
 */

export const DELETION_DELAY_DAYS = 30;

const DELETION_DELAY_MS = DELETION_DELAY_DAYS * 24 * 60 * 60 * 1000;

/** جدول pending حذف لليوزر — بتحدد هل فيه طلب حذف شغال */
export interface PendingDeletion {
  id: string;
  email: string;
  display_name: string;
  deletion_requested_at: string;
  deletion_reason: string | null;
}

export async function fetchPendingDeletion(userId: string): Promise<PendingDeletion | null> {
  const rows = (await sql`
    SELECT id, email, display_name, deletion_requested_at, deletion_reason, is_admin
    FROM users
    WHERE id = ${userId} AND deletion_requested_at IS NOT NULL
  `) as (PendingDeletion & { is_admin: boolean })[];
  const row = rows[0];
  // حسابات الأدمن محمية من نظام الحذف كله
  if (!row || row.is_admin) return null;
  return {
    id: row.id,
    email: row.email,
    display_name: row.display_name,
    deletion_requested_at: row.deletion_requested_at,
    deletion_reason: row.deletion_reason,
  };
}

/** هل انتهت مهلة الـ 30 يوم وماحدش سجل دخول؟ */
export function deletionExpired(requestedAt: string): boolean {
  return Date.now() - new Date(requestedAt).getTime() >= DELETION_DELAY_MS;
}

/** الغي طلب الحذف (المستخدم رجع سجل دخول أو الأدمن رفض) — يرجع true لو كان مجدول فعلاً */
export async function cancelAccountDeletion(userId: string): Promise<boolean> {
  const cleared = (await sql`
    UPDATE users
       SET deletion_requested_at = NULL, deletion_reason = NULL
     WHERE id = ${userId} AND is_admin = FALSE AND deletion_requested_at IS NOT NULL
    RETURNING id
  `) as { id: string }[];
  return cleared.length > 0;
}

/**
 * تنفيذ الحذف النهائي: الـFOREIGN KEY مع ON DELETE CASCADE بيمسح تلقائيًا
 * المحادثات + الرسايل + الرصيد + مفاتيح/رصيد API + الاشتراكات + الذاكرة + الـfacts...
 * الوحيد عمود user_id في api_usage_logs مش مربوط بـ FK فبمسحه يدوي الأول.
 */
export async function finalizeAccountDeletion(userId: string): Promise<void> {
  await sql`DELETE FROM api_usage_logs WHERE user_id = ${userId}`;
  await sql`
    DELETE FROM users
     WHERE id = ${userId} AND is_admin = FALSE
  `;
}

/**
 * بيشيك على كل الطلبات الملتصقة اللي مهلتها انتهت (30 يوم من غير دخول)
 * ويحذفها نهائيًا ويسجلها في السجل. بترجع كم واحد اتحذف.
 */
export async function expireDueDeletions(): Promise<
  { id: string; email: string; display_name: string; deletion_reason: string | null }[]
> {
  const cutoff = new Date(Date.now() - DELETION_DELAY_MS).toISOString();
  const due = (await sql`
    SELECT id, email, display_name, deletion_reason
    FROM users
    WHERE deletion_requested_at IS NOT NULL
      AND is_admin = FALSE
      AND deletion_requested_at <= ${cutoff}::timestamptz
  `) as { id: string; email: string; display_name: string; deletion_reason: string | null }[];

  for (const d of due) {
    await finalizeAccountDeletion(d.id);
    await logDeletionExpired(d);
  }
  return due;
}

/** سجل إجراء النظام في admin_logs لما الحذف يتنفذ تلقائيًا بعد انتهاء المهلة */
export async function logDeletionExpired(d: {
  id: string;
  email: string;
  display_name: string;
  deletion_reason: string | null;
}): Promise<void> {
  try {
    await sql`
      INSERT INTO admin_logs (id, admin_id, admin_email, action, target_user_id, target_email, details)
      VALUES (
        ${randomUUID()}, 'system', 'system', 'finalize_account_deletion',
        ${d.id}, ${d.email},
        ${`حذف تلقائي بعد انتهاء مهلة ${DELETION_DELAY_DAYS} يوم من عدم تسجيل الدخول — سبب الطلب: ${d.deletion_reason || "—"}`}
      )
    `;
  } catch (e) {
    console.error("logDeletionExpired error", e);
  }
}

/** رسالة حذف الحساب بعد مهلة الـ 30 يوم (للمدخل الجديد تاني) */
export const DELETION_ACCOUNT_EXPIRED_MESSAGE =
  "الحساب كان مجدولًا للحذف بعد 30 يوم من عدم الدخول، وانتهت المهلة واتحذف نهائيًا مع كل بياناته. لو عايز ترجع تستخدم المنصة تقدر تسجل حساب جديد.";
