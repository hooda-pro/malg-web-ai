import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql } from "./db";
import { getAdminUser } from "./auth";
import type { SessionUser } from "./types";

export type AdminGuardResult =
  | { ok: true; admin: SessionUser }
  | { ok: false; res: NextResponse };

/** حارس مسارات لوحة الأدمن — بيرجع الأدمن الحالي أو Response بخطأ 403 جاهزة. */
export function requireAdmin(): AdminGuardResult {
  const admin = getAdminUser();
  if (!admin) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: "الوصول مرفوض — الصلاحية دي للأدمن بس" },
        { status: 403 }
      ),
    };
  }
  return { ok: true, admin };
}

/** بيسجل إجراء الأدمن في سجل admin_logs (الأخطاء بتتجاهل عشان مش توقف العملية). */
export async function logAdminAction(
  admin: SessionUser,
  action: string,
  targetUserId?: string | null,
  targetEmail?: string | null,
  details?: string | null
) {
  try {
    await sql`
      INSERT INTO admin_logs (id, admin_id, admin_email, action, target_user_id, target_email, details)
      VALUES (
        ${randomUUID()}, ${admin.id}, ${admin.email}, ${action},
        ${targetUserId ?? null}, ${targetEmail ?? null}, ${details ?? null}
      )
    `;
  } catch (e) {
    console.error("logAdminAction error", e);
  }
}