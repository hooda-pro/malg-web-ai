import { randomUUID } from "crypto";
import { sql } from "./db";
import { checkRateLimitShared } from "./rateLimit";

/**
 * حماية الاستهلاك والتكلفة على مسارات الشات:
 *  1) getUserFlags: صلاحية الأدمن والحظر من الداتابيز (مش من التوكن اللي صالح 30 يوم).
 *  2) checkMessageRate: حد رسايل في الدقيقة/الساعة لكل مستخدم — محسوب من جدول الرسايل نفسه،
 *     فشغال صح حتى لو السيرفر serverless وكل طلب وصل لنسخة مختلفة (عكس rateLimit.ts اللي في الذاكرة).
 *  3) acquireGenerationLease: رد واحد شغال في نفس الوقت لكل مستخدم. من غيره كان ممكن حد يفتح
 *     طلبات كتير بالتوازي: كلها تعدّي فحص الرصيد قبل ما أي واحد يتخصم منه، وكل واحد يشغّل sandbox.
 *
 * ليه الحدود دي مهمة: حساب Token Harbor المجاني ليه سقف طلبات للحساب كله (60/دقيقة و1,800/ساعة
 * حسب صفحة الـ Rate limits الرسمية)، وكل رد ممكن يستهلك أكتر من طلب (جولات الأدوات). مستخدم
 * واحد نشيط جدًا كان يقدر يخنق الموقع على الكل.
 */

export const MESSAGE_LIMIT_PER_MINUTE = 5;
export const MESSAGE_LIMIT_PER_HOUR = 50;
/** أطول مدة ممكن رد واحد ياخدها (maxDuration = 300 ثانية) + هامش صغير. بعدها الحجز بيفك لوحده لو السيرفر اتقتل. */
const LEASE_SECONDS = 305;

export interface UserFlags {
  isAdmin: boolean;
  isBanned: boolean;
}

/**
 * بيجيب صلاحية الأدمن وحالة الحظر من الداتابيز.
 * بيرجع null لو مقدرناش نتأكد (فشل الاستعلام) — والمستدعي لازم يرفض الطلب بـ 503
 * (fail closed). قبل كده كان بيرجع { isBanned: false } عند أي خطأ، يعني مشكلة لحظية
 * في الداتابيز كانت بتعدّي المستخدم المحظور كأنه سليم.
 */
export async function getUserFlags(userId: string): Promise<UserFlags | null> {
  try {
    const rows = (await sql`SELECT is_admin, is_banned FROM users WHERE id = ${userId}`) as {
      is_admin: boolean;
      is_banned: boolean;
    }[];
    return { isAdmin: Boolean(rows[0]?.is_admin), isBanned: Boolean(rows[0]?.is_banned) };
  } catch (e) {
    console.error("getUserFlags failed", e);
    return null;
  }
}

/** رسالة الرفض الموحّدة لما مقدرناش نتحقق من حالة الحساب (مع status 503 و Retry-After). */
export const ACCOUNT_CHECK_UNAVAILABLE_MESSAGE =
  "مقدرناش نتحقق من حالة حسابك دلوقتي (مشكلة مؤقتة) — جرّب تاني بعد شوية.";

export type RateCheck =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; message: string };

export async function checkMessageRate(userId: string): Promise<RateCheck> {
  try {
    const rows = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE m.created_at > now() - interval '1 minute') AS last_minute,
        COUNT(*) AS last_hour,
        EXTRACT(EPOCH FROM (now() - MIN(m.created_at) FILTER (WHERE m.created_at > now() - interval '1 minute'))) AS minute_oldest_age,
        EXTRACT(EPOCH FROM (now() - MIN(m.created_at))) AS hour_oldest_age
      FROM chat_messages m
      JOIN chat_sessions s ON s.id = m.session_id
      WHERE s.user_id = ${userId} AND m.role = 'user' AND m.created_at > now() - interval '1 hour'
    `) as Record<string, unknown>[];
    const r = rows[0] || {};
    const lastMinute = Number(r.last_minute ?? 0);
    const lastHour = Number(r.last_hour ?? 0);

    if (lastHour >= MESSAGE_LIMIT_PER_HOUR) {
      const wait = Math.max(1, Math.ceil(3600 - Number(r.hour_oldest_age ?? 0)));
      return {
        allowed: false,
        retryAfterSeconds: wait,
        message: `وصلت للحد الأقصى للرسايل في الساعة (${MESSAGE_LIMIT_PER_HOUR}). جرّب تاني بعد ${Math.ceil(wait / 60)} دقيقة.`,
      };
    }
    if (lastMinute >= MESSAGE_LIMIT_PER_MINUTE) {
      const wait = Math.max(1, Math.ceil(60 - Number(r.minute_oldest_age ?? 0)));
      return {
        allowed: false,
        retryAfterSeconds: wait,
        message: `بتبعت رسايل بسرعة كبيرة — استنى ${wait} ثانية وجرّب تاني.`,
      };
    }
    return { allowed: true };
  } catch (e) {
    // لو الفحص نفسه فشل مش هنمنع المستخدم؛ الحجز (lease) لسه بيحميك من التوازي.
    console.error("checkMessageRate failed", e);
    return { allowed: true };
  }
}

/**
 * حد لمسار /api/chat/continue — بيستهلك نفس موارد الرد العادي (طلب للموديل + توكنز)
 * لكنه مش بيضيف رسالة user جديدة، فـ checkMessageRate (المبني على جدول الرسايل) مبيشوفوش أصلًا.
 * عشان كده بنعدّه لوحده بعدّاد مشترك في الداتابيز (شغال صح على serverless).
 */
export const CONTINUE_LIMIT_PER_MINUTE = 5;
export const CONTINUE_LIMIT_PER_HOUR = 30;

export async function checkContinueRate(userId: string): Promise<RateCheck> {
  const perMinute = await checkRateLimitShared(`continue:min:${userId}`, {
    maxAttempts: CONTINUE_LIMIT_PER_MINUTE,
    windowMs: 60_000,
    blockMs: 60_000,
  });
  if (!perMinute.allowed) {
    const wait = perMinute.retryAfterSeconds ?? 60;
    return {
      allowed: false,
      retryAfterSeconds: wait,
      message: `بتضغط «كمّل» بسرعة كبيرة — استنى ${wait} ثانية وجرّب تاني.`,
    };
  }
  const perHour = await checkRateLimitShared(`continue:hour:${userId}`, {
    maxAttempts: CONTINUE_LIMIT_PER_HOUR,
    windowMs: 60 * 60_000,
    blockMs: 5 * 60_000,
  });
  if (!perHour.allowed) {
    const wait = perHour.retryAfterSeconds ?? 300;
    return {
      allowed: false,
      retryAfterSeconds: wait,
      message: `وصلت للحد الأقصى لاستكمال الردود في الساعة (${CONTINUE_LIMIT_PER_HOUR}). جرّب تاني بعد ${Math.ceil(wait / 60)} دقيقة.`,
    };
  }
  return { allowed: true };
}

export interface GenerationLease {
  /** بيفك الحجز. آمن تناديه أكتر من مرة، ومبيفكش حجز رد تاني بدأ بعده. */
  release(): Promise<void>;
}

export const GENERATION_BUSY_MESSAGE =
  "لسه فيه رد شغال على حسابك (ممكن في محادثة تانية). استنى لحد ما يخلص أو اضغط «إيقاف» وبعدين ابعت رسالتك.";

/** بيرجع lease لو مفيش رد شغال، أو null لو فيه واحد شغال بالفعل. */
export async function acquireGenerationLease(userId: string): Promise<GenerationLease | null> {
  const token = randomUUID();
  try {
    const rows = await sql`
      UPDATE user_quota
      SET busy_until = now() + make_interval(secs => ${LEASE_SECONDS}::float8), busy_token = ${token}
      WHERE user_id = ${userId} AND (busy_until IS NULL OR busy_until < now())
      RETURNING user_id
    `;
    if (rows.length === 0) return null;
  } catch (e) {
    // مش هنوقف الشات كله بسبب مشكلة في الحجز، بس بنسجّلها.
    console.error("acquireGenerationLease failed", e);
    return { release: async () => {} };
  }
  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      try {
        await sql`UPDATE user_quota SET busy_until = NULL, busy_token = NULL WHERE user_id = ${userId} AND busy_token = ${token}`;
      } catch (e) {
        console.error("releaseGenerationLease failed", e);
      }
    },
  };
}
