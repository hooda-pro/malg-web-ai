import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getUserFlags } from "@/lib/usageGuard";
import { hasPaidSubscription } from "@/lib/subscription";
import { getDefaultModelId, listModels } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** قائمة الموديلات النشطة للواجهة (عام — بدون مفاتيح): id + اسم + وصف + طبقة الاشتراك.
 *  locked = true للموديلات المدفوعة عندما لا يملك المستخدم اشتراكًا ساريًا. */
export async function GET() {
  await ensureSchema();
  const [models, defaultId] = await Promise.all([listModels(true), getDefaultModelId()]);
  const list = models.length > 0
    ? models
    : [{ id: "malg-a3", name: "Malg-A3", description: "", isDefault: true, isActive: true, keysCount: 0, updatedAt: null, tier: "free" as const }];

  let unlocked = false;
  try {
    const user = await getSessionUser().catch(() => null);
    if (user) {
      const flags = await getUserFlags(user.id).catch(() => null);
      unlocked = !!flags?.isAdmin || await hasPaidSubscription(user.id).catch(() => false);
    }
  } catch {
    unlocked = false;
  }

  return NextResponse.json({
    models: list.map((m) => {
      const tier = (m as { tier?: unknown }).tier === "paid" ? "paid" : "free";
      const requiresSubscription = tier === "paid";
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        isDefault: m.id === defaultId || !!m.isDefault,
        tier,
        requiresSubscription,
        locked: requiresSubscription && !unlocked,
      };
    }),
    defaultId,
    hasActiveSubscription: unlocked,
  });
}
