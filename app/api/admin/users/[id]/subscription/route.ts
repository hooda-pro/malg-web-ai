import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import {
  activateSubscription,
  cancelSubscription,
  getActiveSubscription,
} from "@/lib/subscription";
import { getPlan, planPrice, formatUSD, type BillingPeriod } from "@/lib/plans";

export const dynamic = "force-dynamic";

/** اشتراك مستخدم: GET الحالي + سجل مختصر، POST تفعيل/إلغاء (بعد تأكيد الدفع عبر واتساب) */
export async function GET(
  _req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;
  await ensureSchema();

  const targetRows = (await sql`
    SELECT id, email, display_name FROM users WHERE id = ${params.id}
  `) as { id: string; email: string; display_name: string }[];
  if (!targetRows[0]) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

  const current = await getActiveSubscription(params.id).catch(() => null);
  let history: Record<string, unknown>[] = [];
  try {
    history = (await sql`
      SELECT id, plan_id, period, status, started_at, ends_at
      FROM user_subscriptions WHERE user_id = ${params.id}
      ORDER BY started_at DESC LIMIT 10
    `) as Record<string, unknown>[];
  } catch {
    history = [];
  }

  return NextResponse.json({
    current,
    history: (history as Record<string, unknown>[]).map((h) => {
      const pid = String(h.plan_id ?? "");
      return {
        id: String(h.id ?? ""),
        planId: pid,
        planName: getPlan(pid)?.name ?? pid,
        period: h.period,
        status: String(h.status ?? ""),
        startedAt: h.started_at ? String(h.started_at) : "",
        endsAt: h.ends_at ? String(h.ends_at) : null,
        isPaid: pid !== "free",
      };
    }),
  });
}

export async function POST(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;
  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const planId = String(body?.planId || "pro");
  const period = (String(body?.period || "monthly") === "yearly" ? "yearly" : "monthly") as BillingPeriod;

  const targetRows = (await sql`
    SELECT id, email, display_name FROM users WHERE id = ${params.id}
  `) as { id: string; email: string; display_name: string }[];
  const target = targetRows[0];
  if (!target) return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });

  if (action === "cancel") {
    await cancelSubscription(target.id);
    await logAdminAction(guard.admin, "cancel_subscription", target.id, target.email, `إلغاء اشتراك ${target.display_name}`);
    return NextResponse.json({ ok: true, current: null });
  }

  if (action !== "activate") {
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  }
  const plan = getPlan(planId);
  if (!plan || plan.id === "free") {
    return NextResponse.json({ error: "الخطة المجانية ضمنية ولا تحتاج تفعيلًا" }, { status: 400 });
  }

  const sub = await activateSubscription(target.id, plan.id, period);
  await logAdminAction(
    guard.admin, "activate_subscription", target.id, target.email,
    `تفعيل ${plan.name} (${period === "yearly" ? "سنوي" : "شهري"} — ${formatUSD(planPrice(plan, period))}) لـ ${target.display_name} + ${plan.monthlyTokens.toLocaleString("en-US")} توكنز`
  );
  return NextResponse.json({ ok: true, current: sub });
}
