/**
 * توليد الصوت (TTS): نص → مقطع صوتي عبر أي موديل صوتي يضيفه الأدمن
 * (نفس جدول ai_models — modality='tts' — بنفس فكرة مفاتيح الدوران).
 *
 * - للمشتركين (Pro) والأدمن فقط — يتحقق منه الراوت قبل النداء.
 * - الخصم من رصيد التوكنز بعدد الحروف (حماية تكلفة)، والحد الأقصى للنص
 *   يحمي من فواتير ضخمة في الطلب الواحد.
 */

import { sql, ensureSchema } from "./db";
import { cleanBaseUrl, getTtsModelConfig, parseCapabilities, resolveTtsEndpoint } from "./provider";
import { checkAndMaybeRenewQuota, deductTokens } from "./quota";
import { hasPaidSubscription } from "./subscription";

export const TTS_TEXT_MAX_CHARS = 2000;
export const TTS_DEFAULT_VOICE = "alloy";
const TTS_TIMEOUT_MS = 120_000;

export interface TtsVoiceModel {
  id: string;
  name: string;
  description: string;
  tier: "free" | "paid";
  locked: boolean;
  voice: string;
  isDefault: boolean;
  /** هل يدعم النموذج نسخ الصوت بعينة مرجعية (وسم clone) — الواجهة تعرض زرار العينة معاه */
  canClone: boolean;
}

/** موديلات الصوت النشطة للمستخدم + هل له حق الاستخدام (مشترك/أدمن).
 * بيشمّل صفوف modality='tts' + صفوف «النماذج الصوتية» (stt) اللي ليها قدرة tts. */
export async function listTtsModelsForUser(
  userId: string,
  isAdmin: boolean
): Promise<{ models: TtsVoiceModel[]; hasAccess: boolean }> {
  await ensureSchema();
  const unlocked = isAdmin || (await hasPaidSubscription(userId).catch(() => false));
  let rows: {
    id: string;
    name: string;
    description: string | null;
    tier: unknown;
    tts_voice: unknown;
    capabilities: unknown;
    is_default: boolean;
  }[] = [];
  try {
    rows = (await sql`
      SELECT id, name, description, tier, tts_voice, capabilities, is_default
      FROM ai_models
      WHERE is_active = TRUE AND (modality = 'tts' OR (modality = 'stt' AND capabilities LIKE '%tts%'))
      ORDER BY is_default DESC, sort_order ASC, created_at ASC
    `) as typeof rows;
  } catch {
    rows = [];
  }
  return {
    hasAccess: unlocked,
    models: rows.map((r) => {
      const tier = r.tier === "paid" ? "paid" : "free";
      const caps = parseCapabilities(r.capabilities);
      return {
        id: r.id,
        name: r.name,
        description: typeof r.description === "string" ? r.description : "",
        tier,
        locked: tier === "paid" && !unlocked,
        voice: typeof r.tts_voice === "string" ? r.tts_voice : "",
        isDefault: r.is_default === true,
        canClone: caps.includes("clone"),
      };
    }),
  };
}

export interface SynthesizeOptions {
  userId: string;
  isAdmin: boolean;
  text: string;
  modelId?: string;
  /** بيانات العينة المرجعية (data URL) لنسخ الصوت — فارغ/غير موجود = توليد عادي.
   * بيتطلب قدرة clone على الموديل ويقيد الحجم (20MB base64 = 15MB فك ضغط). */
  referenceAudio?: string;
}

/** حد عينة النسخ المرجعية — OpenRouter: 20MB base64 ⇒ ~15MB فك ضغط */
export const TTS_REFERENCE_MAX_BASE64_CHARS = 20_000_000;

export interface SynthesizeResult {
  audio: Uint8Array;
  contentType: string;
  modelName: string;
  chars: number;
}

function upstreamErrorMessage(status: number, bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { error?: { message?: unknown } | string };
    const m = typeof j?.error === "string" ? j.error : (j?.error as { message?: unknown } | undefined)?.message;
    if (typeof m === "string" && m.trim()) return m.trim().slice(0, 300);
  } catch {
    // تجاهل — رسالة عامة تحت
  }
  if (status === 401 || status === 403) return "مفتاح المزوّد مرفوض — راجع مفاتيح موديل الصوت من لوحة الأدمن";
  if (status === 429) return "المزوّد مضغوط حاليًا (rate limit) — حاول بعد دقيقة";
  return "تعذّر توليد الصوت من المزوّد — حاول مجددًا";
}

/** يولّد الصوت ويرجع الباينري — يرمي أخطاء عربية جاهزة للعرض (err.message). */
export async function synthesizeSpeech(opts: SynthesizeOptions): Promise<SynthesizeResult> {
  const text = String(opts.text ?? "").trim();
  if (!text) throw new Error("اكتب النص أولًا");
  if (text.length > TTS_TEXT_MAX_CHARS) {
    throw new Error(`النص طويل — الحد الأقصى ${TTS_TEXT_MAX_CHARS} حرف في المرة الواحدة`);
  }

  await ensureSchema();

  // رصيد التوكنز يحمي من إساءة الاستخدام حتى للمشتركين (يتجدد مع الباقة)
  const quotaCheck = await checkAndMaybeRenewQuota(opts.userId, opts.isAdmin);
  if (quotaCheck.blocked) throw new Error(quotaCheck.message);

  let resolved: Awaited<ReturnType<typeof getTtsModelConfig>>;
  try {
    resolved = await getTtsModelConfig(opts.modelId);
  } catch {
    throw new Error("لا يوجد موديل صوتي نشط — أضف واحدًا من لوحة الأدمن (الموديلات) وحدد نوعه «صوت»");
  }
  if (resolved.tier === "paid" && !opts.isAdmin && !(await hasPaidSubscription(opts.userId).catch(() => false))) {
    throw new Error("NEEDS_PRO");
  }

  const endpoint = resolveTtsEndpoint(resolved.config.baseUrl || cleanBaseUrl(""));
  if (!endpoint) throw new Error("رابط مزوّد الصوت غير مكتمل — راجعه من لوحة الأدمن");
  const keys = Array.isArray(resolved.config.apiKeys) ? resolved.config.apiKeys.filter(Boolean) : [];
  if (keys.length === 0) throw new Error("موديل الصوت بلا مفاتيح — أضف مفتاحًا من لوحة الأدمن");

  // عينة النسخ المرجعية (Voice cloning): عينة واحدة في الطلب، وشكلها data URI صوتي.
  const referenceAudio = typeof opts.referenceAudio === "string" ? opts.referenceAudio.trim() : "";
  let inputReferences: unknown[] | undefined;
  if (referenceAudio) {
    if (!resolved.canClone) {
      throw new Error("النموذج المحدد لا يدعم نسخ الصوت — فعّل قدرة «النسخ» له من لوحة الأدمن");
    }
    if (!/^data:audio\//i.test(referenceAudio) || !referenceAudio.includes("base64,")) {
      throw new Error("عينة النسخ لازم تكون ملف صوتي — انظر الصيغ المدعومة: WAV/MP3/M4A/FLAC/OGG/WebM/AAC");
    }
    if (referenceAudio.length > TTS_REFERENCE_MAX_BASE64_CHARS) {
      throw new Error("عينة النسخ كبيرة جدًا — الحد الأقصى ~15 ميجابايت");
    }
    inputReferences = [{ type: "input_audio", input_audio: { data: referenceAudio } }];
  }

  const payload: Record<string, unknown> = {
    model: resolved.config.model,
    input: text,
    response_format: resolved.ttsFormat,
  };
  // الصوت (voice): اسم الصوت خاص بكل مزوّد — على OpenAI نكتب alloy افتراضيًا لو الصف من غير صوت،
  // وغير كده (زي OpenRouter/Fish) «alloy» أصلاً مش صوت صالح فبقى سبب 400 —
  // فمبعتش voice أصلًا لو الأدمن محددش واحد، والمزوّد بياخد صوته الافتراضي.
  const isOpenAiSpeech = /openai\.com/i.test(endpoint);
  const voiceValue = resolved.voice || (isOpenAiSpeech ? TTS_DEFAULT_VOICE : "");
  if (voiceValue) payload.voice = voiceValue;
  if (inputReferences) payload.input_references = inputReferences;

  let lastError = "";
  for (const key of keys) {
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      });
    } catch {
      lastError = "تعذّر الوصول لمزوّد الصوت — حاول مجددًا";
      continue; // جرّب المفتاح التالي
    }
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      if (res.status === 400) {
        // 400 = خطأ في جسم الطلب نفسه (مش مفتاح/ضغط) — سجّله بالتفصيل عشان التشخيص
        console.error(`[MALG tts] 400 من مزوّد الصوت (${resolved.config.model}):`, bodyText.slice(0, 500));
        throw new Error(upstreamErrorMessage(res.status, bodyText));
      }
      lastError = upstreamErrorMessage(res.status, bodyText);
      continue; // 401/429/5xx → المفتاح التالي
    }
    const contentType = res.headers.get("content-type") || "audio/mpeg";
    if (!contentType.startsWith("audio/")) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(upstreamErrorMessage(res.status, bodyText));
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0) throw new Error("المزوّد رجّع صوتًا فارغًا — حاول مجددًا");
    // الخصم بعد النجاح فقط — بعدد الحروف (تسعير الصوت بالحرف)
    await deductTokens(opts.userId, text.length, opts.isAdmin).catch(() => {});
    return { audio: buf, contentType, modelName: resolved.config.displayName, chars: text.length };
  }
  throw new Error(lastError || "تعذّر توليد الصوت — حاول مجددًا");
}
