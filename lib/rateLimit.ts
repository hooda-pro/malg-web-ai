/**
 * محدودات المعدل (Rate limits) — نسختين:
 *
 *  1) checkRateLimitShared (الأساسية): الحالة متخزنة في Postgres (جدول rate_limits)،
 *     فهي مشتركة بين كل نسخ السيرفر (serverless/Vercel) وبتفضل شغالة بعد أي cold start.
 *     دي اللي لازم تُستخدم لأي حماية أمنية أو حماية تكلفة (تسجيل الدخول، الـ API، continue...).
 *
 *  2) checkRateLimit (in-memory): حالة جوه نسخة السيرفر الواحدة بس — مش موزّعة. بقت
 *     مجرد خطة بديلة (fallback) بتشتغل لو فحص الداتابيز نفسه فشل لحظيًا، عشان ما نسيبش
 *     المسار من غير أي حماية خالص.
 */

import { sql, ensureSchema } from "./db";

interface Bucket {
  count: number;
  firstAttemptAt: number;
  blockedUntil: number | null;
}

const buckets = new Map<string, Bucket>();

// نضف الذاكرة كل شوية عشان ما تكبرش من غير داعي على مدى طويل
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    const idleFor = now - bucket.firstAttemptAt;
    if (idleFor > CLEANUP_INTERVAL_MS && (!bucket.blockedUntil || bucket.blockedUntil < now)) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * بيسجل محاولة لمفتاح معين (مثلاً IP، أو IP+email) ويرجع هل مسموح يكمل ولا لأ.
 * الإعدادات الافتراضية: 8 محاولات كل 5 دقايق، وبعدها قفل لمدة 5 دقايق.
 */
export function checkRateLimit(
  key: string,
  opts: { maxAttempts?: number; windowMs?: number; blockMs?: number } = {}
): RateLimitResult {
  const maxAttempts = opts.maxAttempts ?? 8;
  const windowMs = opts.windowMs ?? 5 * 60 * 1000;
  const blockMs = opts.blockMs ?? 5 * 60 * 1000;

  const now = Date.now();
  cleanup(now);

  let bucket = buckets.get(key);

  if (bucket?.blockedUntil && bucket.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }

  if (!bucket || now - bucket.firstAttemptAt > windowMs) {
    bucket = { count: 0, firstAttemptAt: now, blockedUntil: null };
  }

  bucket.count += 1;

  if (bucket.count > maxAttempts) {
    bucket.blockedUntil = now + blockMs;
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSeconds: Math.ceil(blockMs / 1000) };
  }

  buckets.set(key, bucket);
  return { allowed: true };
}

export interface SharedRateLimitOptions {
  maxAttempts?: number;
  windowMs?: number;
  blockMs?: number;
}

/**
 * نفس منطق checkRateLimit بالظبط (نافذة ثابتة + قفل لمدة blockMs بعد تجاوز الحد)، لكن
 * الحالة في Postgres وبتتحدّث بجملة SQL واحدة ذرّية (upsert) — فمفيش سباق بين طلبين متوازيين،
 * ومشتركة بين كل النسخ. لو الاستعلام فشل نرجع للـ in-memory كخطة بديلة (ونسجّل الخطأ).
 */
export async function checkRateLimitShared(
  key: string,
  opts: SharedRateLimitOptions = {}
): Promise<RateLimitResult> {
  const maxAttempts = opts.maxAttempts ?? 8;
  const windowMs = opts.windowMs ?? 5 * 60 * 1000;
  const blockMs = opts.blockMs ?? 5 * 60 * 1000;
  const windowSecs = windowMs / 1000;
  const blockSecs = blockMs / 1000;

  try {
    await ensureSchema();
    const rows = (await sql`
      INSERT INTO rate_limits AS rl (key, count, window_start, blocked_until)
      VALUES (${key}, 1, now(), NULL)
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rl.blocked_until IS NOT NULL AND rl.blocked_until > now() THEN rl.count
          WHEN now() - rl.window_start > make_interval(secs => ${windowSecs}::float8) THEN 1
          ELSE rl.count + 1
        END,
        window_start = CASE
          WHEN rl.blocked_until IS NOT NULL AND rl.blocked_until > now() THEN rl.window_start
          WHEN now() - rl.window_start > make_interval(secs => ${windowSecs}::float8) THEN now()
          ELSE rl.window_start
        END,
        blocked_until = CASE
          WHEN rl.blocked_until IS NOT NULL AND rl.blocked_until > now() THEN rl.blocked_until
          WHEN now() - rl.window_start > make_interval(secs => ${windowSecs}::float8) THEN NULL
          WHEN rl.count + 1 > ${maxAttempts}::int THEN now() + make_interval(secs => ${blockSecs}::float8)
          ELSE NULL
        END
      RETURNING
        (rl.blocked_until IS NOT NULL AND rl.blocked_until > now()) AS blocked,
        EXTRACT(EPOCH FROM (rl.blocked_until - now())) AS retry_after
    `) as { blocked: boolean; retry_after: string | number | null }[];

    // تنضيف عشوائي خفيف للصفوف القديمة عشان الجدول ما يكبرش (مش على كل طلب).
    if (Math.random() < 0.02) {
      try {
        await sql`
          DELETE FROM rate_limits
          WHERE window_start < now() - interval '1 day'
            AND (blocked_until IS NULL OR blocked_until < now())
        `;
      } catch {
        // تنضيف اختياري — تجاهل أي خطأ
      }
    }

    const row = rows[0];
    if (row?.blocked) {
      const retry = Math.max(1, Math.ceil(Number(row.retry_after ?? blockSecs)));
      return { allowed: false, retryAfterSeconds: retry };
    }
    return { allowed: true };
  } catch (e) {
    console.error("checkRateLimitShared failed — falling back to in-memory limiter", e);
    return checkRateLimit(key, opts);
  }
}

/** بيرجع أفضل تخمين لـ IP الطالب من هيدرز الطلب (خلف بروكسي زي Vercel). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
