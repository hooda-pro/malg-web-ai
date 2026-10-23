import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getUserFlags } from "@/lib/usageGuard";
import { checkRateLimitShared, getClientIp } from "@/lib/rateLimit";
import { listTtsModelsForUser, synthesizeSpeech, TTS_TEXT_MAX_CHARS } from "@/lib/tts";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** قائمة موديلات الصوت النشطة + هل للمستخدم حق الاستخدام (مشترك/أدمن) */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  await ensureSchema();
  const flags = await getUserFlags(user.id).catch(() => null);
  const isAdmin = !!flags?.isAdmin;
  const { models, hasAccess } = await listTtsModelsForUser(user.id, isAdmin);
  return NextResponse.json({ models, hasAccess, maxChars: TTS_TEXT_MAX_CHARS });
}

/** توليد صوت من نص — للمشتركين (Pro) والأدمن فقط، مع حد معدل وخصم من الرصيد */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  const flags = await getUserFlags(user.id);
  if (!flags) {
    return NextResponse.json({ error: "تعذّر التحقق من الحساب — حاول بعد ثوانٍ" }, { status: 503 });
  }
  if (flags.isBanned) {
    return NextResponse.json({ error: "تم حظر حسابك — لا يمكنك استخدام هذه الميزة." }, { status: 403 });
  }
  const isAdmin = flags.isAdmin;
  const { hasAccess } = await listTtsModelsForUser(user.id, isAdmin);
  if (!hasAccess) {
    return NextResponse.json(
      { error: "توليد الصوت للمشتركين في باقة Pro فقط", needsSubscription: true },
      { status: 403 }
    );
  }

  const rl = await checkRateLimitShared(`tts:${user.id}`, {
    maxAttempts: 20,
    windowMs: 60 * 60 * 1000,
    blockMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "تجاوزت حد توليد الصوت المسموح (20 في الساعة) — حاول لاحقًا" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 3600) } }
    );
  }
  void getClientIp(req);

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text : "";
  const modelId = typeof body?.modelId === "string" ? body.modelId : undefined;
  // عينة النسخ المرجعي (اختياري): data URI صوتي مباشرة — الحجم بيتقيد هنا كمان
  const referenceAudio =
    typeof body?.referenceAudio === "string" && body.referenceAudio.startsWith("data:audio/")
      ? body.referenceAudio
      : undefined;

  try {
    const out = await synthesizeSpeech({ userId: user.id, isAdmin, text, modelId, referenceAudio });
    return new Response(out.audio as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": out.contentType,
        "Content-Length": String(out.audio.length),
        "Cache-Control": "no-store",
        "X-TTS-Model": encodeURIComponent(out.modelName),
        "X-TTS-Chars": String(out.chars),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر توليد الصوت";
    if (msg === "NEEDS_PRO") {
      return NextResponse.json(
        { error: "توليد الصوت للمشتركين في باقة Pro فقط", needsSubscription: true },
        { status: 403 }
      );
    }
    const badRequest =
      msg.includes("الحد الأقصى") || msg === "اكتب النص أولًا" || msg.includes("عينة النسخ");
    const status = badRequest ? 400 : msg.includes("رصيد") ? 403 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
