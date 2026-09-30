import { sql } from "./db";
import { formatTokens } from "./ai";
import { QUOTA_RENEWAL_INTERVAL_MS, REGISTERED_TOKEN_QUOTA } from "./systemPrompt";

export async function ensureUserQuota(userId: string) {
  const rows = await sql`SELECT user_id FROM user_quota WHERE user_id = ${userId}`;
  if (rows.length === 0) {
    await sql`
      INSERT INTO user_quota (user_id, total_allocated_tokens, used_tokens)
      VALUES (${userId}, ${REGISTERED_TOKEN_QUOTA}, 0)
      ON CONFLICT (user_id) DO NOTHING
    `;
  }
}

export type QuotaCheckResult =
  /** remaining = التوكنز المتبقية قبل الرد ده (null = مفيش حد، زي الأدمن) */
  | { blocked: false; remaining: number | null }
  | { blocked: true; message: string };

/** نفس منطق checkQuotaAndMaybeRenew في ChatRepository.kt: يسمح، أو يرفض
 * برسالة عربية واضحة، مع تجديد تلقائي بعد شهر كامل (30 يوم) من نفاد الرصيد. */
export async function checkAndMaybeRenewQuota(
  userId: string,
  isAdmin: boolean
): Promise<QuotaCheckResult> {
  await ensureUserQuota(userId);

  const rows = await sql`
    SELECT total_allocated_tokens, used_tokens, quota_exhausted_at
    FROM user_quota WHERE user_id = ${userId}
  `;
  const quota = rows[0] as
    | { total_allocated_tokens: number; used_tokens: number; quota_exhausted_at: string | null }
    | undefined;

  const totalAllocated = Number(quota?.total_allocated_tokens ?? REGISTERED_TOKEN_QUOTA);
  const usedTokens = Number(quota?.used_tokens ?? 0);
  const now = Date.now();

  if (isAdmin) {
    return { blocked: false, remaining: null };
  }

  if (usedTokens < totalAllocated) {
    // الرصيد اتشحن/اتجدد بعد نفاد سابق → نمسح علامة النفاد القديمة (وإلا أي نفاد جاي هيتجدد فورًا بالغلط)
    if (quota?.quota_exhausted_at) {
      await sql`UPDATE user_quota SET quota_exhausted_at = NULL WHERE user_id = ${userId}`;
    }
    return { blocked: false, remaining: totalAllocated - usedTokens };
  }

  const exhaustedAt = quota?.quota_exhausted_at ? new Date(quota.quota_exhausted_at).getTime() : null;

  if (exhaustedAt === null) {
    await sql`
      UPDATE user_quota SET quota_exhausted_at = now()
      WHERE user_id = ${userId} AND quota_exhausted_at IS NULL
    `;
    return {
      blocked: true,
      message: `لقد استنفذت رصيد التوكنز المتاح لك (${formatTokens(totalAllocated)} توكنز). هيتجدد الرصيد تلقائيًا بعد شهر كامل (30 يوم) من دلوقتي، أو اشحن رصيدك فورًا من «شراء توكنز» في قايمة حسابك.`,
    };
  }

  const elapsed = now - exhaustedAt;
  if (elapsed >= QUOTA_RENEWAL_INTERVAL_MS) {
    await sql`
      UPDATE user_quota SET used_tokens = 0, quota_exhausted_at = NULL, updated_at = now()
      WHERE user_id = ${userId}
    `;
    return { blocked: false, remaining: totalAllocated };
  }

  const remainingMs = QUOTA_RENEWAL_INTERVAL_MS - elapsed;
  const remainingDays = Math.floor(remainingMs / 86_400_000);
  const remainingHours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
  const remainingMinutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  const remainingText =
    remainingDays > 0
      ? `${remainingDays} يوم و ${remainingHours} ساعة`
      : remainingHours > 0
        ? `${remainingHours} ساعة و ${remainingMinutes} دقيقة`
        : `${remainingMinutes} دقيقة`;
  return {
    blocked: true,
    message: `لقد استنفذت رصيد التوكنز المتاح لك (${formatTokens(totalAllocated)} توكنز). هيتجدد الرصيد تلقائيًا خلال ${remainingText}، أو اشحن رصيدك فورًا من «شراء توكنز» في قايمة حسابك.`,
  };
}

export async function deductTokens(userId: string, tokens: number, isAdmin = false) {
  await sql`
    UPDATE user_quota SET used_tokens = used_tokens + ${tokens}, updated_at = now()
    WHERE user_id = ${userId}
  `;
  // أول ما الرصيد يخلص بنسجّل لحظة النفاد فورًا (مش عند أول محاولة إرسال) عشان
  // عدّاد التجديد التلقائي (شهر كامل) والواجهة يبدأوا من اللحظة الصح.
  if (!isAdmin) {
    await sql`
      UPDATE user_quota SET quota_exhausted_at = now()
      WHERE user_id = ${userId} AND used_tokens >= total_allocated_tokens AND quota_exhausted_at IS NULL
    `;
  }
}

export interface QuotaSnapshot {
  totalAllocatedTokens: number;
  usedTokens: number;
  quotaExhaustedAt: string | null;
  /** إمتى الرصيد هيتجدد تلقائيًا (null لو الرصيد لسه فيه توكنز أو المستخدم أدمن) */
  renewsAt: string | null;
}

/** لقطة الرصيد الحالية — بتطبّق التجديد التلقائي لو عدّت مدة التجديد (شهر)، فالواجهة تفتح لوحدها من غير رسالة إرسال. */
export async function getQuotaSnapshot(userId: string, isAdmin: boolean): Promise<QuotaSnapshot> {
  await checkAndMaybeRenewQuota(userId, isAdmin);
  const rows = await sql`
    SELECT total_allocated_tokens, used_tokens, quota_exhausted_at
    FROM user_quota WHERE user_id = ${userId}
  `;
  const row = rows[0] as
    | { total_allocated_tokens: number; used_tokens: number; quota_exhausted_at: string | null }
    | undefined;
  const total = Number(row?.total_allocated_tokens ?? REGISTERED_TOKEN_QUOTA);
  const used = Number(row?.used_tokens ?? 0);
  const exhaustedAt = row?.quota_exhausted_at ?? null;
  const depleted = !isAdmin && used >= total;
  return {
    totalAllocatedTokens: total,
    usedTokens: used,
    quotaExhaustedAt: exhaustedAt,
    renewsAt:
      depleted && exhaustedAt
        ? new Date(new Date(exhaustedAt).getTime() + QUOTA_RENEWAL_INTERVAL_MS).toISOString()
        : null,
  };
}
