import { randomUUID } from "crypto";
import { sql } from "./db";
import { getPlan, type BillingPeriod } from "./plans";
import { ensureUserQuota } from "./quota";
import { getModelProvider } from "./provider";

export interface ActiveSubscription {
  id: string;
  planId: string;
  planName: string;
  period: BillingPeriod | null;
  startedAt: string;
  endsAt: string | null;
  isPaid: boolean;
}

/** آخر اشتراك نشط (مع إنهاء المنتهي تلقائيًا). الخطة المجانية ضمنية — لا تُخزّن. */
export async function getActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
  try {
    await sql`UPDATE user_subscriptions SET status = 'expired', updated_at = now()
      WHERE user_id = ${userId} AND status = 'active'
        AND ends_at IS NOT NULL AND ends_at < now()`;
  } catch {
    // الجدول لسه متعملش (أول تشغيل قبل ensureSchema) — مفيش اشتراك
    return null;
  }
  let rows: Record<string, unknown>[] = [];
  try {
    rows = (await sql`
      SELECT id, plan_id, period, started_at, ends_at
      FROM user_subscriptions
      WHERE user_id = ${userId} AND status = 'active'
      ORDER BY started_at DESC
      LIMIT 1
    `) as Record<string, unknown>[];
  } catch {
    return null;
  }
  const r = rows[0];
  if (!r) return null;
  const planId = String(r.plan_id ?? "free");
  const plan = getPlan(planId);
  return {
    id: String(r.id ?? ""),
    planId,
    planName: plan ? plan.name : planId,
    period: (r.period === "yearly" ? "yearly" : r.period === "monthly" ? "monthly" : null) as BillingPeriod | null,
    startedAt: String(r.started_at ?? ""),
    endsAt: r.ends_at ? String(r.ends_at) : null,
    isPaid: planId !== "free",
  };
}

export async function hasPaidSubscription(userId: string): Promise<boolean> {
  const s = await getActiveSubscription(userId).catch(() => null);
  return !!s && s.isPaid;
}

/** هل هذا الموديل محجوب عن الخطة المجانية؟ (مع نفس fallback منطق التفاوض) */
export async function isModelPaid(modelId: string): Promise<boolean> {
  try {
    return (await getModelProvider(modelId)).tier === "paid";
  } catch {
    return false;
  }
}

/**
 * تفعيل اشتراك (بواسطة الأدمن بعد تأكيد الدفع عبر واتساب):
 * - ينهي أي اشتراك نشط سابق، ويبدأ الجديد (30 يوم / 365 يوم).
 * - يمنح توكنز الباقة فورًا على رصيد الشات ويفك علامة النفاد.
 * التجديد = تفعيل جديد (يمنح التوكنز من جديد).
 */
export async function activateSubscription(
  userId: string,
  planId: string,
  period: BillingPeriod
): Promise<ActiveSubscription> {
  const plan = getPlan(planId);
  if (!plan || plan.id === "free") throw new Error("خطة غير صالحة للتفعيل اليدوي");
  if (period !== "monthly" && period !== "yearly") throw new Error("مدة غير صالحة");
  const days = period === "yearly" ? 365 : 30;
  await ensureUserQuota(userId);
  await sql`UPDATE user_subscriptions SET status = 'expired', updated_at = now()
    WHERE user_id = ${userId} AND status = 'active'`;
  const id = randomUUID();
  await sql`
    INSERT INTO user_subscriptions (id, user_id, plan_id, period, status, started_at, ends_at)
    VALUES (${id}, ${userId}, ${plan.id}, ${period}, 'active', now(), now() + (${days} * INTERVAL '1 day'))
  `;
  await sql`
    UPDATE user_quota
    SET total_allocated_tokens = total_allocated_tokens + ${plan.monthlyTokens},
        quota_exhausted_at = NULL, updated_at = now()
    WHERE user_id = ${userId}
  `;
  const sub = await getActiveSubscription(userId);
  if (!sub) throw new Error("تعذر قراءة الاشتراك بعد التفعيل");
  return sub;
}

export async function cancelSubscription(userId: string): Promise<void> {
  await sql`UPDATE user_subscriptions SET status = 'cancelled', updated_at = now()
    WHERE user_id = ${userId} AND status = 'active'`;
}

/**
 * معامل تكلفة الموديل (1 = عادي): تُضرب فيه التوكنز المحسوبة قبل الخصم،
 * عشان الموديلات الغالية (كلود ×4) تستهلك الرصيد أسرع ويتحقق هامش الربح.
 */
export async function getCostMultiplier(modelId: string): Promise<number> {
  try {
    const m = (await getModelProvider(modelId)).costMultiplier;
    return Number.isFinite(m) && (m as number) > 0 ? (m as number) : 1;
  } catch {
    return 1;
  }
}
