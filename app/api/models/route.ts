import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getUserFlags } from "@/lib/usageGuard";
import { hasPaidSubscription } from "@/lib/subscription";
import { getDefaultModelId, listModels } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** قائمة موديلات الشات النشطة للواجهة (عام — بدون مفاتيح): id + اسم + وصف + طبقة الاشتراك.
 *  موديلات الصوت (tts) مستبعدة — لها مسار /api/tts الخاص.
 *  locked = true للموديلات المدفوعة عندما لا يملك المستخدم اشتراكًا ساريًا. */
export async function GET() {
  await ensureSchema();
  const [models, defaultId] = await Promise.all([listModels(true, "chat"), getDefaultModelId()]);
  const list = models.length > 0
    ? models
    : [{ id: "malg-ai", name: "MALG AI", description: "", isDefault: true, isActive: true, keysCount: 0, sortOrder: 0, updatedAt: null, tier: "free" as const, supportsMic: false }];

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
        supportsMic: (m as { supportsMic?: unknown }).supportsMic === true,
      };
    }),
    defaultId,
    hasActiveSubscription: unlocked,
  });
}
