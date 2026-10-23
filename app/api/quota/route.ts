import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getCreditSnapshot } from "@/lib/quota";
import { getActiveSubscription } from "@/lib/subscription";
import { getUserFlags, ACCOUNT_CHECK_UNAVAILABLE_MESSAGE } from "@/lib/usageGuard";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ quota: null });

  await ensureSchema();
  const flags = await getUserFlags(user.id);
  if (!flags) {
    return NextResponse.json(
      { error: ACCOUNT_CHECK_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }
  const { isAdmin } = flags;
  const snap = await getCreditSnapshot(user.id, isAdmin);
  const sub = await getActiveSubscription(user.id).catch(() => null);

  return NextResponse.json({
    quota: {
      totalMicro: snap.totalMicro,
      usedMicro: snap.usedMicro,
      exhaustedAt: snap.exhaustedAt,
      renewsAt: snap.renewsAt,
      isAdmin,
      subscription: isAdmin
        ? { planId: "admin", planName: "Admin", badge: "\u2605", period: null, endsAt: null, isPaid: true, canTopUp: true }
        : sub
          ? { planId: sub.planId, planName: sub.planName, badge: "\u2605", period: sub.period, endsAt: sub.endsAt, isPaid: true, canTopUp: true }
          : { planId: "free", planName: "Free", badge: null, period: null, endsAt: null, isPaid: false, canTopUp: false },
    },
  });
}
