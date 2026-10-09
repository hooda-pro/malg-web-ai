import { REGISTERED_TOKEN_QUOTA } from "./systemPrompt";

export type PlanId = "free" | "pro";
export type BillingPeriod = "monthly" | "yearly";

export interface SubscriptionPlan {
  id: PlanId;
  /** الاسم المعروض */
  name: string;
  tagline: string;
  /** توكنز تُمنح مع كل تفعيل/تجديد */
  monthlyTokens: number;
  /** هل تفتح الموديلات المدفوعة */
  paidModels: boolean;
  /** هل يسمح بشراء توكنز إضافية أثناء الاشتراك */
  topUpAllowed: boolean;
  monthlyUSD: number | null;
  yearlyUSD: number | null;
  /** شارة مميزة (★) — للباقات المدفوعة فقط */
  badge: string | null;
}

export const FREE_PLAN: SubscriptionPlan = {
  id: "free",
  name: "Free",
  tagline: "رصيد شهري أساسي والموديلات المجانية",
  monthlyTokens: REGISTERED_TOKEN_QUOTA,
  paidModels: false,
  topUpAllowed: false,
  monthlyUSD: 0,
  yearlyUSD: 0,
  badge: null,
};

/**
 * اقتصاديات الهامش (claude-sonnet-5.5 عبر Token Harbor: $2 دخول / $10 خروج):
 * استهلاك الشات input-heavy (سياق + هيستوري) فالمتوسط المرجح ≈ $4 لكل مليون حقيقي.
 * معامل التكلفة ×4 على موديل كلود يعني: 20M رصيد Pro ≈ 5M حقيقي ≈ $20 تكلفة
 * مقابل $25 سعر → ≈ $5 ربح لكل مشترك نشط، قبل الشحن الإضافي.
 * الشحن الإضافي المحروق على الموديل الرخيص تكلفته ≈ صفر (تهجين متقاطع يغطي
 * حرق كلود). لو تغيّرت أسعار المزوّد، عدّل cost_multiplier من عمود ai_models.
 */
export const PRO_PLAN: SubscriptionPlan = {
  id: "pro",
  name: "Pro",
  tagline: "كل الموديلات + رصيد شهري ضخم + شحن إضافي براحتك",
  monthlyTokens: 20_000_000,
  paidModels: true,
  topUpAllowed: true,
  monthlyUSD: 25,
  yearlyUSD: 250,
  badge: "\u2605",
};

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [FREE_PLAN, PRO_PLAN];

export function getPlan(id: unknown): SubscriptionPlan | null {
  const t = String(id ?? "").trim().toLowerCase();
  return SUBSCRIPTION_PLANS.find((p) => p.id === t) ?? null;
}

export function planPrice(plan: SubscriptionPlan, period: BillingPeriod): number {
  return period === "yearly" ? (plan.yearlyUSD ?? 0) : (plan.monthlyUSD ?? 0);
}

export function formatUSD(n: number): string {
  return `$${new Intl.NumberFormat("en-US").format(n)}`;
}

/** رسالة واتساب جاهزة لطلب اشتراك — فيها الباقة والمدة وبيانات الحساب */
export function buildSubscribeMessage(
  plan: SubscriptionPlan,
  period: BillingPeriod,
  user?: { displayName?: string | null; email?: string | null } | null
): string {
  const periodLabel = period === "yearly" ? "سنوي (12 شهر)" : "شهري";
  const lines = [
    "مرحباً 👋",
    "عايز أشترك في موقع MALG AI:",
    "",
    `👑 الباقة: ${plan.name}${plan.badge ? " " + plan.badge : ""}`,
    `📅 المدة: ${periodLabel}`,
    `💰 السعر: ${formatUSD(planPrice(plan, period))}`,
  ];
  if (user?.displayName || user?.email) {
    lines.push("", `👤 حسابي: ${user.displayName || "—"}${user.email ? ` (${user.email})` : ""}`);
  }
  lines.push("", "محتاج أأكد الاشتراك وطرق الدفع ✨");
  return lines.join("\n");
}

/** لقطة اشتراك المستخدم — شكل رد /api/quota.subscription (تُمرر للواجهة) */
export interface SubscriptionInfo {
  planId: string;
  planName: string;
  badge: string | null;
  period: BillingPeriod | null;
  endsAt: string | null;
  isPaid: boolean;
  canTopUp: boolean;
}
