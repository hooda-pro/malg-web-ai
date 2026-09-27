/**
 * محدود معدل بسيط في الذاكرة — بيمنع محاولات تسجيل الدخول المتكررة بسرعة
 * (Brute force) على مسارات حساسة زي /api/auth/login.
 *
 * ملحوظة: ده حل بسيط شغال جوه نسخة السيرفر الواحدة (in-memory)، مش موزّع
 * بين عدة نسخ سيرفرلس. بيدي حماية أساسية معقولة؛ لو حابب حماية أقوى على
 * نطاق واسع، الأفضل تستخدم خدمة مخصصة زي Upstash Ratelimit أو Vercel
 * Firewall / WAF فوق الطبقة دي.
 */

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

/** بيرجع أفضل تخمين لـ IP الطالب من هيدرز الطلب (خلف بروكسي زي Vercel). */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
