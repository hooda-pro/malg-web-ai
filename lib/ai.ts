import { MODEL_GLM_45_FLASH, MODEL_GLM_47_FLASH } from "./systemPrompt";

const GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "minimax/minimax-m3:free";
// من غير max_tokens صريح، بعض مزوّدي OpenRouter (خصوصاً على المسارات المجانية)
// بيرجعوا لحد افتراضي واطي جداً (زي 4096) فبيقطعوا الكود في نص الملف — ده كان
// سبب رئيسي في ظهور أكواد ناقصة/مكسورة من موديل malg-2.1. الموديل بيدعم مخرجات
// لغاية 262K توكن فعليًا، فبنطلب حد أعلى بأمان (32K) يغطي أي صفحة/مشروع عادي.
const OPENROUTER_MAX_TOKENS = 32000;

// malg-2.2 — Qwen3.8 Max (مجاني) عبر بوابة xKiro (متوافقة مع صيغة OpenAI)
const XKIRO_BASE_URL = "https://api.xkiro.com/v1/chat/completions";
const XKIRO_MODEL = "qwen/qwen3.8-max:free";
const XKIRO_MAX_TOKENS = 32000;

/** الموديلات المتاحة للمستخدم من الواجهة — لازم تتطابق مع components/SettingsContext.tsx */
export type ModelId = "malg-2" | "malg-2.1" | "malg-2.2";
export const DEFAULT_MODEL: ModelId = "malg-2";

export function normalizeModelId(raw: unknown): ModelId {
  if (raw === "malg-2.1") return "malg-2.1";
  if (raw === "malg-2.2") return "malg-2.2";
  return "malg-2";
}

export interface ApiMessage {
  role: string;
  content: string;
}

export function parseErrorMessage(httpCode: number, rawJson: string): string {
  try {
    if (rawJson.includes("1302") || rawJson.includes("速率限制")) {
      return "تم الوصول لمعدل الطلبات المسموح (Rate Limit): النموذج المجاني GLM-4.7-Flash يتيح طلباً واحداً متزامناً (1 Concurrency). يُرجى الانتظار 2-3 ثوانٍ فقط وإعادة المحاولة وسيعمل فوراً!";
    }
    if (rawJson.includes("1113") || rawJson.includes("余额不足")) {
      return "خطأ 1113 (رصيد الحساب): تم اختيار نموذج مدفوع يحتاج رصيداً. يرجى اختيار النموذج المجاني GLM-4.7-Flash.";
    }
    if (rawJson.includes("1211") || rawJson.includes("模型不存在")) {
      return "خطأ 1211: كود النموذج غير صالح. استخدم النموذج المجاني GLM-4.7-Flash.";
    }
    if (
      rawJson.includes("1001") ||
      rawJson.includes("1002") ||
      rawJson.includes("未收到Authorization")
    ) {
      return "خطأ في مفتاح API: المفتاح المدخل غير مصرح به أو تم إلغاؤه من المنصة.";
    }
    if (rawJson.includes("1301") || rawJson.includes("并发")) {
      return "خطأ ضغط على السيرفر (Concurrency Limit): يُرجى الانتظار ثانية واحدة وإعادة الإرسال.";
    }
    return `خطأ من الخادم (${httpCode}): ${rawJson.slice(0, 300)}`;
  } catch {
    return `خطأ في الاتصال بالخادم (${httpCode})`;
  }
}

/** تقدير تقريبي لعدد التوكنز (نفس منطق ChatRepository.estimateTokens في تطبيق الأندرويد). */
export function estimateTokens(...texts: (string | null | undefined)[]): number {
  const sum = texts.reduce((acc, t) => acc + Math.floor((t?.length ?? 0) / 3), 0);
  return sum + 10;
}

export function formatTokens(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type NegotiationResult =
  | { ok: true; response: Response }
  | { ok: false; errorMessage: string };

/**
 * يجرب الاتصال بموديل mlag (GLM) بنفس منطق إعادة المحاولة والتراجع
 * (fallback) الموجود في ApiClient.kt / ChatRepository.kt الأصلي:
 * 1) الموديل المختار + أدوات البحث على الإنترنت
 * 2) لو 429 ينتظر 1.5 ثانية ويعيد المحاولة
 * 3) لو فشل، يعيد المحاولة بدون tools
 * 4) لو لسه فاشل، يجرب الموديل المجاني الاحتياطي glm-4.5-flash بدون tools
 */
async function negotiateGLM(apiMessages: ApiMessage[], signal: AbortSignal): Promise<NegotiationResult> {
  const apiKey = process.env.MLAG_API_KEY || "";
  const model = process.env.MLAG_MODEL?.trim() || MODEL_GLM_47_FLASH;

  const tools = [
    { type: "web_search", web_search: { enable: true, search_result: true } },
  ];

  const buildBody = (m: string, useTools: boolean) =>
    JSON.stringify({
      model: m,
      messages: apiMessages,
      temperature: 0.4,
      max_tokens: 96000,
      stream: true,
      ...(useTools ? { tools } : {}),
    });

  const call = (m: string, useTools: boolean) =>
    fetch(GLM_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: buildBody(m, useTools),
      signal,
    });

  let response: Response;
  try {
    response = await call(model, true);
  } catch (e) {
    if (signal.aborted) throw e;
    return { ok: false, errorMessage: "تعذر الاتصال بخادم mlag، تأكد من اتصالك بالإنترنت وحاول تاني." };
  }

  if (response.status === 429) {
    await sleep(1500);
    try {
      response = await call(model, true);
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }

  if (!response.ok) {
    try {
      const retryResp = await call(model, false);
      if (retryResp.ok) response = retryResp;
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }

  if (!response.ok && model !== MODEL_GLM_45_FLASH) {
    try {
      const fallbackResp = await call(MODEL_GLM_45_FLASH, false);
      if (fallbackResp.ok) response = fallbackResp;
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }

  if (!response.ok) {
    let rawError = "";
    try {
      rawError = await response.text();
    } catch {
      // تجاهل
    }
    return { ok: false, errorMessage: parseErrorMessage(response.status, rawError) };
  }

  return { ok: true, response };
}

// ---------------------------------------------------------------------------
// قارئ عام لمفاتيح API (مشترك بين malg-2.1 و malg-2.2)
// ---------------------------------------------------------------------------

/**
 * قارئ عام لمفاتيح API بيدعم أي عدد من المفاتيح لأي مزوّد — استخدمه أي مكان
 * محتاج فيه تدوير مفاتيح، بنفس الطريقتين اللي شرحناها فوق لـ OpenRouter:
 *
 * 1) متغيرات مرقمة منفصلة (الأسهل لو عايز تضيف/تشيل مفتاح لوحده من غير ما تلمس الباقي):
 *      <PREFIX>1 = key-1
 *      <PREFIX>2 = key-2
 *      ... لحد أي رقم عايزه (مفيش حد أقصى)، وبيقبل صيغة الـ underscore زي <PREFIX>_1 برضو
 *
 * 2) أو متغير واحد فيه كل المفاتيح مفصولة بفاصلة/سطر جديد/فاصلة منقوطة:
 *      <PREFIX> = key-1,key-2,key-3
 *
 * @param numberedPrefix جزء الـ regex لاسم المتغير قبل الرقم، مثلاً "OPENROUTER_API_KEYS?"
 *   (الـ "?" بعد الـ S بتخليه يقبل الصيغتين KEY و KEYS) أو "XKIRO_API_KEYS?"
 * @param bulkVarNames أسماء المتغيرات اللي ممكن تحتوي على كل المفاتيح مع بعض (بالترتيب)
 */
function collectApiKeys(numberedPrefix: string, ...bulkVarNames: string[]): string[] {
  const keys: string[] = [];

  const numberedPattern = new RegExp(`^${numberedPrefix}_?(\\d+)$`, "i");
  const numberedEntries = Object.keys(process.env)
    .map((name) => {
      const match = name.match(numberedPattern);
      return match ? { name, index: parseInt(match[1], 10) } : null;
    })
    .filter((x): x is { name: string; index: number } => x !== null)
    .sort((a, b) => a.index - b.index);

  for (const entry of numberedEntries) {
    const val = process.env[entry.name];
    if (val && val.trim()) keys.push(val.trim());
  }

  for (const varName of bulkVarNames) {
    const bulk = process.env[varName] || "";
    for (const k of bulk.split(/[\n,;]+/)) {
      const trimmed = k.trim();
      if (trimmed) keys.push(trimmed);
    }
  }

  // شيل أي تكرار مع الحفاظ على الترتيب
  return [...new Set(keys)];
}

// ---------------------------------------------------------------------------
// malg-2.1 — OpenRouter (minimax/minimax-m3:free) مع تدوير عدة مفاتيح API
// ---------------------------------------------------------------------------

/**
 * بيقرأ كل مفاتيح OpenRouter — أضف واحد أو أكتر بأي من الطريقتين:
 *
 *      OPENROUTER_API_KEYS1 = sk-or-key-1
 *      OPENROUTER_API_KEYS2 = sk-or-key-2
 *      OPENROUTER_API_KEYS3 = sk-or-key-3
 *      ... أو
 *      OPENROUTER_API_KEYS  = sk-or-key-1,sk-or-key-2,sk-or-key-3
 *
 * الكود بيجمع الاتنين مع بعض لو موجودين، وبيشيل أي تكرار.
 */
function getOpenRouterKeys(): string[] {
  return collectApiKeys("OPENROUTER_API_KEYS?", "OPENROUTER_API_KEYS", "OPENROUTER_API_KEY");
}

// عداد بسيط في الذاكرة لتدوير المفاتيح (Round Robin) بين الطلبات المختلفة —
// كل طلب بيبدأ من مفتاح مختلف عن اللي قبله عشان الحمل يتوزع على كل المفاتيح بالتساوي.
let openRouterCursor = 0;

function parseOpenRouterError(httpCode: number, rawJson: string): string {
  try {
    if (httpCode === 401 || httpCode === 403) {
      return "أحد مفاتيح OpenRouter غير صالح أو ملغي — تأكد من المفاتيح في إعدادات Vercel.";
    }
    if (httpCode === 402) {
      return "رصيد أحد مفاتيح OpenRouter انتهى.";
    }
    if (httpCode === 429) {
      return "تم الوصول لمعدل الطلبات المسموح على مفاتيح OpenRouter الحالية.";
    }
    return `خطأ من OpenRouter (${httpCode}): ${rawJson.slice(0, 300)}`;
  } catch {
    return `خطأ في الاتصال بـ OpenRouter (${httpCode})`;
  }
}

/**
 * يجرب موديل malg-2.1 (minimax/minimax-m3:free عبر OpenRouter):
 * بيدور على المفاتيح المتاحة واحد ورا التاني (تدوير + تجاوز أي مفتاح فشل بسبب
 * انتهاء رصيده أو معدل طلباته) لحد ما يلاقي مفتاح شغال أو يخلص كل المفاتيح.
 */
async function negotiateOpenRouter(
  apiMessages: ApiMessage[],
  signal: AbortSignal
): Promise<NegotiationResult> {
  const keys = getOpenRouterKeys();
  if (keys.length === 0) {
    return {
      ok: false,
      errorMessage:
        "موديل malg-2.1 محتاج مفتاح OpenRouter واحد على الأقل — ضيف OPENROUTER_API_KEYS1 (وهكذا) أو OPENROUTER_API_KEYS في إعدادات Vercel.",
    };
  }

  const call = (key: string, useTools: boolean) =>
    fetch(OPENROUTER_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "https://mlag.ai",
        "X-Title": "mlag AI",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: apiMessages,
        temperature: 0.4,
        max_tokens: OPENROUTER_MAX_TOKENS,
        stream: true,
        // أداة بحث الإنترنت المدمجة في OpenRouter نفسه (server-side): الموديل هو
        // اللي بيقرر لو محتاج يبحث ولا لأ، والبحث بيتنفذ عند OpenRouter مباشرة —
        // مفيش حاجة إضافية لازم نعملها هنا، النتيجة بترجع جوه نفس الستريم العادي.
        ...(useTools ? { tools: [{ type: "openrouter:web_search" }] } : {}),
      }),
      signal,
    });

  let lastErrorCode = 0;
  let lastErrorText = "";

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(openRouterCursor + i) % keys.length];
    let response: Response;
    try {
      response = await call(key, true);
    } catch (e) {
      if (signal.aborted) throw e;
      continue; // مشكلة شبكة مؤقتة — جرّب المفتاح اللي بعده
    }

    // لو الخطأ مش بسبب المفتاح نفسه (401/402/403/429)، جرب نفس المفتاح تاني
    // بدون أداة البحث، تحسبًا إن أداة البحث (لسه beta) مش مدعومة على المسار ده
    if (!response.ok && ![401, 402, 403, 429].includes(response.status)) {
      try {
        const retryResp = await call(key, false);
        if (retryResp.ok) response = retryResp;
      } catch (e) {
        if (signal.aborted) throw e;
      }
    }

    if (response.ok) {
      openRouterCursor = (openRouterCursor + i + 1) % keys.length;
      return { ok: true, response };
    }

    lastErrorCode = response.status;
    // 429 (تجاوز الحد) أو 402 (رصيد خلص) أو 401/403 (مفتاح لاغي) — جرّب المفتاح اللي بعده
    if ([401, 402, 403, 429].includes(response.status)) {
      try {
        lastErrorText = await response.text();
      } catch {
        // تجاهل
      }
      continue;
    }

    // أي خطأ تاني (500 مثلاً) — سيبه ونجرب مفتاح تاني برضو، بس نسجله
    try {
      lastErrorText = await response.text();
    } catch {
      // تجاهل
    }
  }

  return { ok: false, errorMessage: parseOpenRouterError(lastErrorCode || 502, lastErrorText) };
}

// ---------------------------------------------------------------------------
// malg-2.2 — Qwen3.8 Max (مجاني) عبر بوابة xKiro، مع تدوير عدة مفاتيح API
// ---------------------------------------------------------------------------

/**
 * بيقرأ كل مفاتيح xKiro — أضف واحد أو أكتر بأي من الطريقتين (زي بالظبط OpenRouter فوق):
 *
 *      XKIRO_API_KEYS1 = sk-xt-key-1
 *      XKIRO_API_KEYS2 = sk-xt-key-2
 *      XKIRO_API_KEYS3 = sk-xt-key-3
 *      ... أو
 *      XKIRO_API_KEYS  = sk-xt-key-1,sk-xt-key-2,sk-xt-key-3
 */
function getXkiroKeys(): string[] {
  return collectApiKeys("XKIRO_API_KEYS?", "XKIRO_API_KEYS", "XKIRO_API_KEY");
}

// عداد تدوير منفصل عن OpenRouter — كل موديل بيدور على مفاتيحه لوحده
let xkiroCursor = 0;

function parseXkiroError(httpCode: number, rawJson: string): string {
  try {
    if (httpCode === 401 || httpCode === 403) {
      return "أحد مفاتيح xKiro غير صالح أو ملغي — تأكد من المفاتيح في إعدادات Vercel.";
    }
    if (httpCode === 402) {
      return "رصيد أحد مفاتيح xKiro انتهى.";
    }
    if (httpCode === 429) {
      return "تم الوصول لمعدل الطلبات المسموح على مفاتيح xKiro الحالية.";
    }
    return `خطأ من xKiro (${httpCode}): ${rawJson.slice(0, 300)}`;
  } catch {
    return `خطأ في الاتصال بـ xKiro (${httpCode})`;
  }
}

/**
 * يجرب موديل malg-2.2 (qwen/qwen3.8-max:free عبر xKiro):
 * نفس منطق تدوير المفاتيح بتاع malg-2.1 بالظبط.
 *
 * ملحوظة عن البحث في الإنترنت: على عكس malg-2 (GLM) و malg-2.1 (OpenRouter)،
 * بوابة xKiro مالهاش أداة بحث جاهزة تشتغل من عندها هي — بتدعم بس "function calling"
 * عادي (يعني إنت اللي تجيب دالة وتنفذها بنفسك لما الموديل يطلبها). عشان Qwen هنا
 * يبحث فعليًا في الإنترنت، لازم نضيف مزوّد بحث خارجي (زي Tavily أو Serper) ونعمل
 * دورة كاملة: نبعت الدالة، الموديل يطلبها، إحنا ننفذ البحث الحقيقي، وبعدين نرجعله
 * النتيجة في طلب تاني. ده أكبر من مجرد "فلاج" زي الموديلين التانيين، فسبناه لتحديث
 * لاحق لو حابب تضيفه.
 */
async function negotiateXkiro(apiMessages: ApiMessage[], signal: AbortSignal): Promise<NegotiationResult> {
  const keys = getXkiroKeys();
  if (keys.length === 0) {
    return {
      ok: false,
      errorMessage:
        "موديل malg-2.2 محتاج مفتاح xKiro واحد على الأقل — ضيف XKIRO_API_KEYS1 (وهكذا) أو XKIRO_API_KEYS في إعدادات Vercel.",
    };
  }

  const call = (key: string) =>
    fetch(XKIRO_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: XKIRO_MODEL,
        messages: apiMessages,
        temperature: 0.4,
        max_tokens: XKIRO_MAX_TOKENS,
        stream: true,
      }),
      signal,
    });

  let lastErrorCode = 0;
  let lastErrorText = "";

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(xkiroCursor + i) % keys.length];
    let response: Response;
    try {
      response = await call(key);
    } catch (e) {
      if (signal.aborted) throw e;
      continue; // مشكلة شبكة مؤقتة — جرّب المفتاح اللي بعده
    }

    if (response.ok) {
      xkiroCursor = (xkiroCursor + i + 1) % keys.length;
      return { ok: true, response };
    }

    lastErrorCode = response.status;
    if ([401, 402, 403, 429].includes(response.status)) {
      try {
        lastErrorText = await response.text();
      } catch {
        // تجاهل
      }
      continue;
    }

    try {
      lastErrorText = await response.text();
    } catch {
      // تجاهل
    }
  }

  return { ok: false, errorMessage: parseXkiroError(lastErrorCode || 502, lastErrorText) };
}

/**
 * نقطة الدخول الموحدة: بتوجه الطلب لموديل malg-2 (GLM) أو malg-2.1 (OpenRouter)
 * أو malg-2.2 (xKiro) حسب اختيار المستخدم من قايمة الموديلات فوق في الواجهة.
 */
export async function negotiateUpstream(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  modelId: ModelId = DEFAULT_MODEL
): Promise<NegotiationResult> {
  if (modelId === "malg-2.1") {
    return negotiateOpenRouter(apiMessages, signal);
  }
  if (modelId === "malg-2.2") {
    return negotiateXkiro(apiMessages, signal);
  }
  return negotiateGLM(apiMessages, signal);
}
