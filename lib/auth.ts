import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { SessionUser } from "./types";
import { sql } from "./db";

export const COOKIE_NAME = "mlag_session";

// ثغرة أمنية اتصلحت: لو JWT_SECRET مش متظبط، كان بيستخدم قيمة ثابتة معروفة
// في الكود ("dev-insecure-secret-change-me") — يعني أي حد شاف السورس كان
// يقدر يوقّع توكن جلسة مزور لأي يوزر (حتى أدمن) ويدخل بيه. دلوقتي: في
// production لازم JWT_SECRET يكون متظبط، وإلا السيرفر يرفض يوقّع/يتحقق من
// أي جلسة بدل ما يشتغل بمفتاح ضعيف معروف.
const SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET مش متظبط (أو قصير جدًا) في متغيرات البيئة — ده مطلوب في الإنتاج. " +
        "ضيف قيمة عشوائية طويلة (32+ حرف) في Vercel Project Settings > Environment Variables."
    );
  }
  return "dev-only-insecure-secret-do-not-use-in-production";
})();
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 يوم

export function signSession(user: SessionUser): string {
  return jwt.sign(user, SECRET, { expiresIn: MAX_AGE_SECONDS });
}

export function verifySession(token: string): SessionUser | null {
  try {
    const decoded = jwt.verify(token, SECRET);
    if (
      typeof decoded === "object" &&
      decoded &&
      "id" in decoded &&
      "email" in decoded
    ) {
      return decoded as SessionUser;
    }
    return null;
  } catch {
    return null;
  }
}

/** يقرأ اليوزر الحالي من الكوكي — يستخدم جوه Route Handlers و Server Components. */
export function getSessionUser(): SessionUser | null {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

export const SESSION_COOKIE_MAX_AGE = MAX_AGE_SECONDS;

/** بيرجع اليوزر لو أدمن، وإلا null — الحارس بتاع مسارات لوحة الأدمن. */
export function getAdminUser(): SessionUser | null {
  const user = getSessionUser();
  return user && user.isAdmin ? user : null;
}

/**
 * بيفحص من قاعدة البيانات هل الحساب متحظر ولا لأ — لأن التوكن (JWT) مش بيحمل
 * حالة الحظر، فلازم نفحص من المصدر مباشرة قبل أي عملية شات.
 */
export async function isUserBanned(userId: string): Promise<boolean> {
  try {
    const rows = await sql`SELECT is_banned FROM users WHERE id = ${userId}`;
    return Boolean(rows[0]?.is_banned);
  } catch {
    return false;
  }
}
