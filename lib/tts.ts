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
  let base = "";
  let raw = "";
  try {
    const j = JSON.parse(bodyText) as {
      error?:
        | string
        | { message?: unknown; metadata?: { raw?: unknown; raw_message?: unknown; provider_name?: unknown } | string };
    };
    const e = typeof j?.error === "string" ? { message: j.error } : j?.error;
    const m = typeof (e as { message?: unknown } | undefined)?.message === "string" ? (e as { message?: string }).message : undefined;
    if (m?.trim()) base = m.trim().slice(0, 300);
    // تفاصيل الخطأ الحقيقية من المزوّد — OpenRouter بيلفها في error.metadata
    const md = (e as { metadata?: unknown } | undefined)?.metadata;
    if (typeof md === "string") raw = md;
    else if (md && typeof md === "object") {
      const mdRaw = (md as { raw?: unknown }).raw;
      const mdRawMessage = (md as { raw_message?: unknown }).raw_message;
      if (typeof mdRaw === "string" && mdRaw.trim()) raw = mdRaw;
      else if (typeof mdRawMessage === "string" && mdRawMessage.trim()) raw = mdRawMessage;
    }
  } catch {
    // تجاهل — رسالة عامة تحت
  }
  if (!base) {
    if (status === 401 || status === 403) base = "مفتاح المزوّد مرفوض — راجع مفاتيح موديل الصوت من لوحة الأدمن";
    else if (status === 429) base = "المزوّد مضغوط حاليًا (rate limit) — حاول بعد دقيقة";
    else base = "تعذّر توليد الصوت من المزوّد — حاول مجددًا";
  }
  return raw ? `${base} — تفاصيل المزوّد: ${raw.trim().slice(0, 220)}` : base;
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

  // أسماء محاولة النداء: الاسم المخزّن زي ما هو أولًا، وعلى OpenRouter لو مكتوب بدون
  // لاحقة التسعير بنداّ كمان بإضافة «:free» — التجربة الحية بالمفتاح أثبتت إن توجيه
  // الصوت بيرجّع 404 «No endpoints found» للاسم من غيرها (مثال دليل صفحة النموذج بيغلط).
  const modelVariants = [resolved.config.model];
  if (/openrouter\.ai/i.test(endpoint) && !/:free$/i.test(resolved.config.model)) {
    modelVariants.push(`${resolved.config.model}:free`);
  }

  let lastError = "";
  outer: for (const key of keys) {
    for (const modelVariant of modelVariants) {
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, model: modelVariant }),
          signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
        });
      } catch {
        lastError = "تعذّر الوصول لمزوّد الصوت — حاول مجددًا";
        continue outer; // الشبكة مقطوعة — جرّب المفتاح التالي
      }
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        const msg = upstreamErrorMessage(res.status, bodyText);
        if (res.status === 400 || res.status === 404) {
          // 400/404 = مشكلة في الطلب نفسه (مش المفتاح) — سجّل التفاصيل وجرّب اسم النموذج التاني
          console.error(
            `[MALG tts] ${res.status} من مزوّد الصوت (${modelVariant}):`,
            bodyText.slice(0, 500)
          );
          lastError = msg;
          continue; // مسار الاسم البديل (بدون :free مثلاً)
        }
        lastError = msg;
        continue outer; // 401/429/5xx → المفتاح التالي
      }
      if (modelVariant !== resolved.config.model) {
        console.error(`[MALG tts] نجح التوليد بالاسم البديل «${modelVariant}» — عدّل اسم الموديل في الصف لده`);
      }
      const contentType = res.headers.get("content-type") || "audio/mpeg";
      if (!contentType.startsWith("audio/")) {
        const bodyText = await res.text().catch(() => "");
        lastError = upstreamErrorMessage(res.status, bodyText);
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length === 0) throw new Error("المزوّد رجّع صوتًا فارغًا — حاول مجددًا");
      // الخصم بعد النجاح فقط — بعدد الحروف (تسعير الصوت بالحرف)
      await deductTokens(opts.userId, text.length, opts.isAdmin).catch(() => {});
      return { audio: buf, contentType, modelName: resolved.config.displayName, chars: text.length };
    }
  }
  throw new Error(lastError || "تعذّر توليد الصوت — حاول مجددًا");
}
