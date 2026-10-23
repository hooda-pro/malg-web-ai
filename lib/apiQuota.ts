import { sql } from "./db";

/**
 * نفس بنية lib/quota.ts بالظبط، لكن لرصيد الـ API المنفصل (user_api_quota) —
 * دلوقتي بالـmicro-dollar (تحديث ١٩: $1 = 1,000,000 µ$)، بفرقين مقصودين:
 * 1) من غير تجديد شهري تلقائي — رصيد الـ API مدفوع بالكامل، مش رصيد
 *    مجاني بيتجدد لوحده زي رصيد الشات.
 * 2) الرصيد الافتراضي صفر — أي حساب جديد ميقدرش يكلم نقطة الـ API خالص
 *    لحد ما يشحن رصيد فعلي، حتى لو نفس الحساب عنده رصيد شات طبيعي.
 * (أعمدة الأعمدة القديمة بالتوكنز اتسابتها الأعمدة الجديدة total_micro/used_micro،
 * والرصيد القديم اترحّل لمرة واحدة بمعدل تجسيري 2µ$/توكن — شوف lib/db.ts.)
 */

export async function ensureUserApiQuota(userId: string) {
  const rows = await sql`SELECT user_id FROM user_api_quota WHERE user_id = ${userId}`;
  if (rows.length === 0) {
    await sql`
      INSERT INTO user_api_quota (user_id, total_micro, used_micro)
      VALUES (${userId}, 0, 0)
      ON CONFLICT (user_id) DO NOTHING
    `;
  }
}

export type ApiQuotaCheckResult =
  | { blocked: false }
  | { blocked: true; message: string };

/** رسالة الرفض الموحّدة — نفس الرسالة سواء الرصيد صفر من الأساس أو خلص بالاستخدام. */
const API_QUOTA_EXHAUSTED_MESSAGE = "رصيد الـ API خالص — اشحن رصيدك (بالدولار) من صفحة API.";

export async function checkApiBalance(userId: string): Promise<ApiQuotaCheckResult> {
  await ensureUserApiQuota(userId);

  const rows = await sql`
    SELECT total_micro, used_micro FROM user_api_quota WHERE user_id = ${userId}
  `;
  const quota = rows[0] as
    | { total_micro: number; used_micro: number }
    | undefined;

  const totalMicro = Number(quota?.total_micro ?? 0);
  const usedMicro = Number(quota?.used_micro ?? 0);

  if (totalMicro - usedMicro > 0) {
    return { blocked: false };
  }

  return { blocked: true, message: API_QUOTA_EXHAUSTED_MESSAGE };
}

export async function deductApiBalance(userId: string, microUSD: number) {
  if (!(microUSD > 0)) return;
  await sql`
    UPDATE user_api_quota SET used_micro = used_micro + ${microUSD}, updated_at = now()
    WHERE user_id = ${userId}
  `;
}
