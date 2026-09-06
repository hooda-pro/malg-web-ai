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
  | { blocked: false }
  | { blocked: true; message: string };

/** نفس منطق checkQuotaAndMaybeRenew في ChatRepository.kt: يسمح، أو يرفض
 * برسالة عربية واضحة، مع تجديد تلقائي بعد أسبوع من نفاد الرصيد. */
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

  if (isAdmin || usedTokens < totalAllocated) {
    return { blocked: false };
  }

  const exhaustedAt = quota?.quota_exhausted_at ? new Date(quota.quota_exhausted_at).getTime() : null;

  if (exhaustedAt === null) {
    await sql`
      UPDATE user_quota SET quota_exhausted_at = now()
      WHERE user_id = ${userId} AND quota_exhausted_at IS NULL
    `;
    return {
      blocked: true,
      message: `لقد استنفذت رصيد التوكنز المتاح لك (${formatTokens(totalAllocated)} توكنز). هيتجدد الرصيد تلقائيًا بعد أسبوع من دلوقتي، أو اشحن رصيدك فورًا من زر «شحن الرصيد» وتواصل معانا واتساب ✨`,
    };
  }

  const elapsed = now - exhaustedAt;
  if (elapsed >= QUOTA_RENEWAL_INTERVAL_MS) {
    await sql`
      UPDATE user_quota SET used_tokens = 0, quota_exhausted_at = NULL, updated_at = now()
      WHERE user_id = ${userId}
    `;
    return { blocked: false };
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
    message: `لقد استنفذت رصيد التوكنز المتاح لك (${formatTokens(totalAllocated)} توكنز). هيتجدد الرصيد تلقائيًا خلال ${remainingText}، أو اشحن رصيدك فورًا من زر «شحن الرصيد» وتواصل معانا واتساب ✨`,
  };
}

export async function deductTokens(userId: string, tokens: number) {
  await sql`
    UPDATE user_quota SET used_tokens = used_tokens + ${tokens}, updated_at = now()
    WHERE user_id = ${userId}
  `;
}
