import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { SessionUser } from "./types";
import { sql } from "./db";

export const COOKIE_NAME = "mlag_session";
const SECRET = process.env.JWT_SECRET || "dev-insecure-secret-change-me";
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
