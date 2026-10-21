import { sql } from "./db";

/**
 * نفس بنية lib/quota.ts بالظبط، لكن لرصيد الـ API المنفصل (user_api_quota)
 * بفرقين مقصودين:
 * 1) من غير تجديد أسبوعي تلقائي — رصيد الـ API مدفوع بالكامل، مش رصيد
 *    مجاني بيتجدد لوحده زي رصيد الشات.
 * 2) الرصيد الافتراضي صفر — أي حساب جديد ميقدرش يكلم نقطة الـ API خالص
 *    لحد ما يشحن رصيد فعلي، حتى لو نفس الحساب عنده رصيد شات طبيعي.
 */

export async function ensureUserApiQuota(userId: string) {
  const rows = await sql`SELECT user_id FROM user_api_quota WHERE user_id = ${userId}`;
  if (rows.length === 0) {
    await sql`
      INSERT INTO user_api_quota (user_id, total_allocated_tokens, used_tokens)
      VALUES (${userId}, 0, 0)
      ON CONFLICT (user_id) DO NOTHING
    `;
  }
}

export type ApiQuotaCheckResult =
  | { blocked: false }
  | { blocked: true; message: string };

/** رسالة الرفض الموحّدة — نفس الرسالة سواء الرصيد صفر من الأساس أو خلص بالاستخدام. */
const API_QUOTA_EXHAUSTED_MESSAGE = "رصيد الـ API خالص — اشحن رصيدك من صفحة API.";

export async function checkApiBalance(userId: string): Promise<ApiQuotaCheckResult> {
  await ensureUserApiQuota(userId);

  const rows = await sql`
    SELECT total_allocated_tokens, used_tokens FROM user_api_quota WHERE user_id = ${userId}
  `;
  const quota = rows[0] as
    | { total_allocated_tokens: number; used_tokens: number }
    | undefined;

  const totalAllocated = Number(quota?.total_allocated_tokens ?? 0);
  const usedTokens = Number(quota?.used_tokens ?? 0);

  if (totalAllocated - usedTokens > 0) {
    return { blocked: false };
  }

  return { blocked: true, message: API_QUOTA_EXHAUSTED_MESSAGE };
}

export async function deductApiTokens(userId: string, tokens: number) {
  if (!(tokens > 0)) return;
  await sql`
    UPDATE user_api_quota SET used_tokens = used_tokens + ${tokens}, updated_at = now()
    WHERE user_id = ${userId}
  `;
}
