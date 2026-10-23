/**
 * توليد الصوت (TTS): نص → مقطع صوتي عبر أي موديل صوتي يضيفه الأدمن
 * (نفس جدول ai_models — modality='tts' — بنفس فكرة مفاتيح الدوران).
 *
 * - للمشتركين (Pro) والأدمن فقط — يتحقق منه الراوت قبل النداء.
 * - الخصم من الرصيد حسب سعر الموديل لكل مليون حرف (موديل من غير سعر = مجاني)،
 *   والحد الأقصى للنص يحمي من فواتير ضخمة في الطلب الواحد.
 */

import { sql, ensureSchema } from "./db";
import { cleanBaseUrl, getTtsModelConfig, parseCapabilities, resolveTtsEndpoint } from "./provider";
import { checkAndMaybeRenewCredits, costWithProfitMicro, deductBalance } from "./quota";
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
  /** هل يدعم لمسة الأداء (علامات S2 داخل النص) — بيتحدد من مزوّد الرابط (OpenRouter/Fish) */
  styleOk: boolean;
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
    base_url: unknown;
  }[] = [];
  try {
    rows = (await sql`
      SELECT id, name, description, tier, tts_voice, capabilities, is_default, base_url
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
      const baseUrl = typeof r.base_url === "string" ? r.base_url : "";
      return {
        id: r.id,
        name: r.name,
        description: typeof r.description === "string" ? r.description : "",
        tier,
        locked: tier === "paid" && !unlocked,
        voice: typeof r.tts_voice === "string" ? r.tts_voice : "",
        isDefault: r.is_default === true,
        canClone: caps.includes("clone"),
        // علامات الأداء ([brackets] بتاعة Fish S2) بتمر حرفيًا على غير OpenRouter — فنتجاهلها هناك
        styleOk: /openrouter\.ai/i.test(cleanBaseUrl(baseUrl)),
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
  /** لمسة الأداء: طابع + سرعة + ضحك — بتتحول لعلامات S2 جوه النص (OpenRouter/Fish فقط). */
  style?: TtsStyle;
}

/** لمسة الأداء اللي بيختارها المستخدم في الاستوديو — بتتحول لعلامات [brackets] جوا النص. */
export interface TtsStyle {
  /** نوع الصوت: male / female — وصف مفتوح بيأثر على الطبقة الصوتية (فاضي = التلقائي) */
  voiceGender?: string;
  /** طابع الجملة: playful / angry / excited / calm / whispering — فاضي = عادي */
  mood?: string;
  /** سرعة: brisk = سريع شوية بصياغة طبيعية — غيره = عادية */
  speed?: string;
  /** ضحك في اللحظات المناسبة: قهقهة خفيفة بعد أول جملة + ضحكة بالآخر */
  laughs?: boolean;
}

/** الطوابع المسموحة — من دليل Fish S2 (open-domain، بس منقّي هنا لمنع الفوضى) */
const TTS_MOODS_ALLOWED = new Set(["", "playful", "angry", "excited", "calm", "whispering"]);
const TTS_GENDERS_ALLOWED = new Set(["", "male", "female"]);

/**
 * بيطبّق اللمسة على النص قبل النداء — علامات S2.1-Pro open-domain (اي وصف بين أقواس مربعة).
 * قواعد دليل Fish الرسمي: طابع الجملة أول الجملة، الأصوات في أي مكان،
 * وما تحشّش النص القصير في علامات.
 * على مزوّد غير OpenRouter (زي OpenAI) الأقواس هتتقرا حرفيًا — فنتجاهل اللمسة هناك.
 */
export function applyVoiceStyle(text: string, style: TtsStyle | undefined, isOpenRouter: boolean): string {
  if (!isOpenRouter || !style) return text;
  const gender = typeof style.voiceGender === "string" && TTS_GENDERS_ALLOWED.has(style.voiceGender) ? style.voiceGender : "";
  const mood = typeof style.mood === "string" && TTS_MOODS_ALLOWED.has(style.mood) ? style.mood : "";
  const brisk = style.speed === "brisk";
  const laughs = style.laughs === true;
  if (!gender && !mood && !brisk && !laughs) return text;
  const headParts = [
    gender === "male" ? "[male voice]" : "",
    gender === "female" ? "[female voice]" : "",
    mood ? `[${mood}]` : "",
    brisk ? "[speaking briskly but clearly]" : "",
  ].filter(Boolean);
  let out = headParts.length ? `${headParts.join(" ")} ${text}` : text;
  if (laughs) {
    // قهقهة خفيفة بعد أول جملة (لو فيه كمان جمل بعد فترات) + ضحكة كاملة بالآخر — من غير نص مزوّر
    let cut = -1;
    for (const mark of ["؟", "?", "!", "."]) {
      const i = out.indexOf(mark);
      if (i >= 0 && i < out.length - 3 && (cut === -1 || i < cut)) cut = i;
    }
    if (cut >= 0) out = `${out.slice(0, cut + 1)} [chuckling] ${out.slice(cut + 1).trim()}`;
    out = `${out.trim()} [laughing]`;
  }
  return out;
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
  // بنحاول ناخد رسالة مفهومة من جسم الخطأ، بس من غير ما نعرض تفاصيل المزوّد الخام
  // (أسماء مزوّدين/مفاتيح/مسارات داخلية) — نفس فلسفة SAFE_MESSAGES في lib/ai.ts.
  let base = "";
  try {
    const j = JSON.parse(bodyText) as {
      error?: string | { message?: unknown };
    };
    const e = typeof j?.error === "string" ? { message: j.error } : j?.error;
    const m = typeof (e as { message?: unknown } | undefined)?.message === "string" ? (e as { message?: string }).message : undefined;
    if (m?.trim()) {
      // نفلتر الرسائل اللي فيها أسماء مزوّدين أو تفاصيل داخلية — نرجّع رسالة عامة بدلها
      const suspicious = /openrouter|openai|fish|elevenlabs|azure|replicate|api[_ ]?key|token|endpoint|url|http/i;
      base = suspicious.test(m) ? "" : m.trim().slice(0, 300);
    }
  } catch {
    // تجاهل — رسالة عامة تحت
  }
  if (!base) {
    if (status === 401 || status === 403) base = "تعذّر توليد الصوت حاليًا — حاول مجددًا بعد قليل";
    else if (status === 429) base = "الخدمة مزدحمة حاليًا — حاول بعد دقيقة";
    else base = "تعذّر توليد الصوت حاليًا — حاول مجددًا";
  }
  return base;
}

/** يولّد الصوت ويرجع الباينري — يرمي أخطاء عربية جاهزة للعرض (err.message). */
export async function synthesizeSpeech(opts: SynthesizeOptions): Promise<SynthesizeResult> {
  const text = String(opts.text ?? "").trim();
  if (!text) throw new Error("اكتب النص أولًا");
  if (text.length > TTS_TEXT_MAX_CHARS) {
    throw new Error(`النص طويل — الحد الأقصى ${TTS_TEXT_MAX_CHARS} حرف في المرة الواحدة`);
  }

  await ensureSchema();

  // الرصيد يحمي من إساءة الاستخدام حتى للمشتركين (بيتجدد مع الباقة / بالإضافة اليدوية)
  const quotaCheck = await checkAndMaybeRenewCredits(opts.userId, opts.isAdmin);
  if (quotaCheck.blocked) throw new Error(quotaCheck.message);

  let resolved: Awaited<ReturnType<typeof getTtsModelConfig>>;
  try {
    resolved = await getTtsModelConfig(opts.modelId);
  } catch {
    throw new Error("لا يوجد موديل صوتي متاح حاليًا — جرّب مرة أخرى لاحقًا");
  }
  if (resolved.tier === "paid" && !opts.isAdmin && !(await hasPaidSubscription(opts.userId).catch(() => false))) {
    throw new Error("NEEDS_PRO");
  }

  const endpoint = resolveTtsEndpoint(resolved.config.baseUrl || cleanBaseUrl(""));
  if (!endpoint) throw new Error("خدمة الصوت غير متاحة حاليًا — جرّب مرة أخرى لاحقًا");
  const keys = Array.isArray(resolved.config.apiKeys) ? resolved.config.apiKeys.filter(Boolean) : [];
  if (keys.length === 0) throw new Error("خدمة الصوت غير متاحة حاليًا — جرّب مرة أخرى لاحقًا");

  // عينة النسخ المرجعية (Voice cloning): عينة واحدة في الطلب، وشكلها data URI صوتي.
  const referenceAudio = typeof opts.referenceAudio === "string" ? opts.referenceAudio.trim() : "";
  let inputReferences: unknown[] | undefined;
  if (referenceAudio) {
    if (!resolved.canClone) {
      throw new Error("النموذج الصوتي المحدد لا يدعم نسخ الصوت — اختر نموذجًا آخر");
    }
    if (!/^data:audio\//i.test(referenceAudio) || !referenceAudio.includes("base64,")) {
      throw new Error("عينة النسخ لازم تكون ملف صوتي — انظر الصيغ المدعومة: WAV/MP3/M4A/FLAC/OGG/WebM/AAC");
    }
    if (referenceAudio.length > TTS_REFERENCE_MAX_BASE64_CHARS) {
      throw new Error("عينة النسخ كبيرة جدًا — الحد الأقصى ~15 ميجابايت");
    }
    inputReferences = [{ type: "input_audio", input_audio: { data: referenceAudio } }];
  }

  // لمسة الأداء: علامات S2 جوه النص (OpenRouter بس) — الخصم/الحد بيتحسب على النص الأصلي مش اللمسة
  const styledInput = applyVoiceStyle(text, opts.style, /openrouter\.ai/i.test(endpoint));
  const payload: Record<string, unknown> = {
    model: resolved.config.model,
    input: styledInput,
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
        lastError = "تعذّر توليد الصوت — حاول مجددًا";
        continue outer; // الشبكة مقطوعة — جرّب المفتاح التالي
      }
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        // التفاصيل الكاملة في الـ server logs بس — والمستخدم ياخد رسالة آمنة بدون أسرار المزوّد
        console.error(`[MALG tts] ${res.status} من مزوّد الصوت (${modelVariant}):`, bodyText.slice(0, 500));
        const msg = upstreamErrorMessage(res.status, bodyText);
        if (res.status === 400 || res.status === 404) {
          // 400/404 = مشكلة في الطلب نفسه (مش المفتاح) — جرّب اسم النموذج التاني
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
      if (buf.length === 0) throw new Error("تعذّر توليد الصوت — حاول مجددًا");
      // الخصم بعد النجاح فقط — حسب سعر الموديل لكل مليون حرف (× الهامش + الربح الثابت)
      const chargeMicro = costWithProfitMicro(
        text.length,
        0,
        resolved.config.priceInMicro ?? 0,
        0,
        resolved.config.costMultiplier ?? 1,
        resolved.config.profitUsdMicro ?? 0
      );
      if (chargeMicro > 0) await deductBalance(opts.userId, chargeMicro, opts.isAdmin).catch(() => {});
      return { audio: buf, contentType, modelName: resolved.config.displayName, chars: text.length };
    }
  }
  throw new Error(lastError || "تعذّر توليد الصوت — حاول مجددًا");
}
