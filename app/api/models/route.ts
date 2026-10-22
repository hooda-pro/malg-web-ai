import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getUserFlags } from "@/lib/usageGuard";
import { hasPaidSubscription } from "@/lib/subscription";
import { getDefaultModelId, listModels, isVoiceModelRow } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** قائمة الموديلات للواجهة (عام — بدون مفاتيح): id + اسم + وصف + طبقة الاشتراك.
 *  الشات النصي هو اللي بيُختار، وصفوف الصوت بترجع معاها بعلم comingSoon=true
 *  (قسم "قريبًا" غير قابل للاختيار — واجهة الصوت المنفصلة الجاية).
 *  locked = true للموديلات المدفوعة عندما لا يملك المستخدم اشتراكًا ساريًا. */
export async function GET() {
  await ensureSchema();
  // الشات النصي (modality=chat) هو الوحيد اللي بيُختار — صفوف الصوت كلها
  // بتظهر كقسم منفصل "قريبًا" غير قابل للاختيار (واجهة الصوت الجاية).
  const [allChat, defaultId, voiceRows] = await Promise.all([
    listModels(true, "chat"),
    getDefaultModelId(),
    listModels(true, "tts").catch(() => []),
  ]);
  // صف صوت اتسجل على modality=chat بالغلط (id فيه voice) بينزل لقسم الصوت برضه
  const chatRows = allChat.filter((m) => !isVoiceModelRow(m.id));
  const list = chatRows.length > 0
    ? chatRows
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

  // تجميع صفوف الصوت (من الشات + من قايمة tts المتخصصة)
  const voiceSeen = new Set<string>();
  const voiceTeasers: Array<{ id: string; name: string; description: string; supportsMic: boolean }> = [];
  const addTeaser = (id: unknown, name: unknown, description: unknown, supportsMic: boolean) => {
    const vid = String(id ?? "");
    if (!vid || !isVoiceModelRow(vid) || voiceSeen.has(vid)) return;
    voiceSeen.add(vid);
    voiceTeasers.push({
      id: vid,
      name: String(name ?? vid),
      description: typeof description === "string" ? description : "",
      supportsMic,
    });
  };
  for (const m of allChat) addTeaser(m.id, m.name, m.description, (m as { supportsMic?: unknown }).supportsMic === true);
  for (const m of voiceRows) addTeaser(m.id, m.name, m.description, (m as { supportsMic?: unknown }).supportsMic === true);

  return NextResponse.json({
    models: [
      ...list.map((m) => {
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
          comingSoon: false,
        };
      }),
      ...voiceTeasers.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        isDefault: false,
        tier: "free",
        requiresSubscription: false,
        locked: false,
        supportsMic: m.supportsMic,
        comingSoon: true,
      })),
    ],
    defaultId,
    hasActiveSubscription: unlocked,
  });
}
