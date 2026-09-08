import { MODEL_GLM_45_FLASH, MODEL_GLM_47_FLASH } from "./systemPrompt";

const GLM_BASE_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
// حد الإخراج الحقيقي لـ GLM-4.7-Flash (وكذلك الافتراضي glm-4.5-flash) هو
// 131,072 توكن — بنطلب حد أعلى بأمان (128K) قريب منه عشان رد واحد طويل (زي
// كتابة ملف كبير أو مشروع كامل في استدعاء أداة واحد) ما يتقطعش في نص الطريق.
const GLM_MAX_TOKENS = 128000;

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "minimax/minimax-m3:free";
// من غير max_tokens صريح، بعض مزوّدي OpenRouter (خصوصاً على المسارات المجانية)
// بيرجعوا لحد افتراضي واطي جداً (زي 4096) فبيقطعوا الكود في نص الملف — ده كان
// سبب رئيسي في ظهور أكواد ناقصة/مكسورة من موديل malg-2.1. الموديل بيدعم مخرجات
// لغاية 512K توكن فعليًا، فبنطلب حد أعلى بأمان (128K) يغطي أي رد طويل حقيقي
// (زي كتابة ملف كبير جوه استدعاء أداة واحد) من غير ما يتقطع في نص الطريق.
const OPENROUTER_MAX_TOKENS = 128000;

// malg-2.2 — Qwen3.8 Max (مجاني) عبر بوابة xKiro (متوافقة مع صيغة OpenAI)
const XKIRO_BASE_URL = "https://api.xkiro.com/v1/chat/completions";
const XKIRO_MODEL = "qwen/qwen3.8-max:free";
// حد الإخراج الحقيقي لـ Qwen3.8 Max هو 131,072 توكن — نفس منطق GLM فوق.
const XKIRO_MAX_TOKENS = 128000;

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
  /** لازمة لرسايل role: "tool" (نتيجة تنفيذ أداة) عشان الموديل يعرف الرد ده
   * بتاع أنهي استدعاء أداة بالظبط — مهم خصوصًا لو أكتر من أداة اتطلبت مع بعض. */
  tool_call_id?: string;
  /** بعض الصيغ بتحط اسم الأداة هنا كمان لرسايل "tool". */
  name?: string;
  /** لرسايل role: "assistant" اللي طلبت استدعاء أداة قبل كده في المحادثة —
   * لازم تتنقل زي ما هي (مش بس content) عشان الموديل يفتكر إيه اللي طلبه. */
  tool_calls?: UpstreamToolCall[];
}

// ---------------------------------------------------------------------------
// قارئ ستريم موحّد (مشترك بين /api/chat و /api/chat/continue)
// ---------------------------------------------------------------------------

export interface UpstreamToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface UpstreamStreamResult {
  content: string;
  reasoning: string;
  finishReason: string | null;
  stoppedByUser: boolean;
  /** موجودة بس لو الموديل طلب استدعاء أداة (function calling) — اختيارية عشان
   * الاستدعاءات القديمة (retry-merge جوه /api/chat و /api/chat/continue) تفضل
   * صحيحة من غير ما تحتاج تتعدل، لأنها أصلاً مش بتستخدم الحقل ده. */
  toolCalls?: UpstreamToolCall[];
}

/**
 * يقرأ ستريم SSE من أي مزوّد (GLM / OpenRouter / xKiro) ويجمّع الـ content و
 * الـ reasoning تدريجيًا، مع استدعاء onDelta لحظيًا لكل جزء يوصل (عشان نقدر
 * نبعته للعميل فورًا زي ما كنا بنعمل بالـ passthrough الخام قديمًا). بيجمّع
 * كمان أي tool_calls (function calling) لو الموديل طلب استدعاء أداة — دي
 * بتوصل مجزّأة عبر عدة أجزاء ستريم (id/name مرة واحدة، والـ arguments بيتبني
 * تدريجيًا نص JSON فوق نص) فبنجمعها هنا بالـ index وترجع كاملة في النهاية.
 *
 * ملحوظة مهمة (سبب رئيسي لمشكلة "malg-2.1 معتش بيكتب كود"): الموديلات
 * المجانية زي minimax-m3:free بترجع أحيانًا استجابة HTTP سليمة (200) لكن
 * الستريم نفسه بيوصل فاضي تمامًا (من غير content ولا حتى reasoning) — ده مش
 * خطأ شبكة، فالكود القديم كان بيعتبره "نجاح" ويحفظ رسالة وهمية "تمت المعالجة
 * بنجاح" من غير أي محتوى حقيقي، فالمستخدم يحس إن الموديل "بطل يكتب" من غير أي
 * تفسير. الدالة دي بترجع stoppedByUser بشكل منفصل عشان نفرّق بين إيقاف
 * المستخدم المتعمد وبين استجابة فاضية فعلاً محتاجة إعادة محاولة.
 */
export async function readUpstreamStream(
  response: Response,
  signal: AbortSignal,
  onDelta: (kind: "content" | "reasoning", text: string) => void
): Promise<UpstreamStreamResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let content = "";
  let reasoning = "";
  let finishReason: string | null = null;
  let stoppedByUser = false;
  const toolCallsAcc: { id: string; name: string; arguments: string }[] = [];

  const onAbort = () => {
    stoppedByUser = true;
    try {
      reader.cancel();
    } catch {
      // تجاهل
    }
  };
  signal.addEventListener("abort", onAbort);

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line || line.startsWith(":") || !line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    try {
      const json = JSON.parse(data);
      const choice = json?.choices?.[0];
      if (choice?.finish_reason) finishReason = choice.finish_reason;
      const delta = choice?.delta;
      if (delta?.reasoning_content) {
        reasoning += delta.reasoning_content;
        onDelta("reasoning", delta.reasoning_content);
      }
      if (delta?.content) {
        content += delta.content;
        onDelta("content", delta.content);
      }
      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = typeof tc?.index === "number" ? tc.index : toolCallsAcc.length;
          if (!toolCallsAcc[idx]) toolCallsAcc[idx] = { id: "", name: "", arguments: "" };
          if (tc?.id) toolCallsAcc[idx].id = tc.id;
          if (tc?.function?.name) toolCallsAcc[idx].name += tc.function.name;
          if (tc?.function?.arguments) toolCallsAcc[idx].arguments += tc.function.arguments;
        }
      }
    } catch {
      // سطر غير صالح كـ JSON — تجاهله
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    }
  } catch {
    // انقطاع أثناء القراءة (إيقاف المستخدم أو خطأ اتصال مؤقت)
  } finally {
    signal.removeEventListener("abort", onAbort);
  }

  const toolCalls: UpstreamToolCall[] = toolCallsAcc
    .map((tc, i) =>
      tc
        ? { id: tc.id || `call_${i}`, type: "function" as const, function: { name: tc.name, arguments: tc.arguments } }
        : null
    )
    .filter((tc): tc is UpstreamToolCall => tc !== null);

  return { content, reasoning, finishReason, stoppedByUser, toolCalls };
}

/** رسالة صادقة تتكتب للمستخدم لو الموديل رجّع استجابة فاضية بعد كل المحاولات
 * — بدل ما نكذب ونقول "تمت المعالجة بنجاح" من غير أي محتوى فعلي. */
export const EMPTY_RESPONSE_FALLBACK_MESSAGE =
  "معنديش رد فعلي أقدر أكتبهولك دلوقتي 🙏 — الموديل مارجعش أي محتوى بعد أكتر من محاولة (مشكلة مؤقتة في المزوّد الخارجي، مش في سؤالك). جرب تبعت رسالتك تاني كمان شوية، أو اختار موديل تاني من القايمة لو الموضوع مستعجل.";

export function parseErrorMessage(httpCode: number, rawJson: string): string {
  // ملحوظة أمان/خصوصية مهمة: كانت الدالة دي بترجع نص الخطأ الخام والمعرّف
  // للمزوّد الحقيقي (GLM) مباشرة لواجهة المستخدم — يعني أي حد كان يقدر
  // يعرف إن mlag شغال فوق موديل خارجي بس من رسالة الخطأ. دلوقتي: بنسجل
  // التفاصيل الكاملة في الـ server logs بس (console.error) ونرجّع للمستخدم
  // رسالة عامة بهوية mlag بس، من غير أي اسم مزوّد أو كود داخلي أو JSON خام.
  console.error("[mlag upstream error]", httpCode, rawJson.slice(0, 500));
  try {
    if (rawJson.includes("1302") || rawJson.includes("速率限制") || httpCode === 429) {
      return "الخدمة مزدحمة شوية دلوقتي — استنى ثانيتين وابعت تاني وهيشتغل.";
    }
    if (rawJson.includes("1113") || rawJson.includes("余额不足") || httpCode === 402) {
      return "في مشكلة مؤقتة في تشغيل الرد دلوقتي — جرب تاني كمان شوية.";
    }
    if (rawJson.includes("1211") || rawJson.includes("模型不存在")) {
      return "حصلت مشكلة تقنية داخلية — فريق mlag شغال على حلها، جرب موديل تاني أو حاول تاني بعد شوية.";
    }
    if (rawJson.includes("1001") || rawJson.includes("1002") || rawJson.includes("未收到Authorization")) {
      return "حصلت مشكلة في الاتصال بالخدمة دلوقتي — جرب تاني بعد شوية.";
    }
    if (rawJson.includes("1301") || rawJson.includes("并发")) {
      return "في ضغط على الخدمة دلوقتي — استنى ثانية واحدة وابعت تاني.";
    }
    return "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني، ولو المشكلة استمرت جرب موديل تاني من القايمة.";
  } catch {
    return "حصلت مشكلة في الاتصال بالخدمة — جرب تاني.";
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
 * خيارات إضافية اختيارية لـ negotiateUpstream — بتتبعت بس من نقطة الـ API
 * العامة (app/api/malg/v1/chat/completions) لما المستدعي (أداة زي Cline)
 * تبعت تعريفات أدوات (function calling) في طلبها. من غير الحقل ده، السلوك
 * القديم لـ /api/chat و /api/chat/continue فاضل زي ما هو بالظبط.
 */
export interface NegotiateOptions {
  /** تعريفات أدوات على نمط OpenAI — بتتبعت زي ما هي من غير أي تعديل. لو
   * موجودة لـ GLM/OpenRouter، بتحل محل أداة البحث المدمجة بتاعت الموقع
   * (مش بتتخلط معاها)، عشان منلخبطش الموديل بين سياق الموقع وسياق الأداة
   * الخارجية المستدعية. */
  tools?: unknown[];
  toolChoice?: unknown;
}

/**
 * يجرب الاتصال بموديل mlag (GLM) بنفس منطق إعادة المحاولة والتراجع
 * (fallback) الموجود في ApiClient.kt / ChatRepository.kt الأصلي:
 * 1) الموديل المختار + أدوات البحث على الإنترنت
 * 2) لو 429 ينتظر 1.5 ثانية ويعيد المحاولة
 * 3) لو فشل، يعيد المحاولة بدون tools
 * 4) لو لسه فاشل، يجرب الموديل المجاني الاحتياطي glm-4.5-flash بدون tools
 */
async function negotiateGLM(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  options: NegotiateOptions = {}
): Promise<NegotiationResult> {
  const apiKey = process.env.MLAG_API_KEY || "";
  const model = process.env.MLAG_MODEL?.trim() || MODEL_GLM_47_FLASH;

  // لو المستدعي (نقطة الـ API العامة) بعت أدوات بتاعته هو (زي Cline)، بنستخدمها
  // هي بدل أداة البحث المدمجة بتاعت الموقع — مش بنخلطهم مع بعض.
  const externalTools = options.tools && options.tools.length > 0 ? options.tools : null;
  const builtInTools = [{ type: "web_search", web_search: { enable: true, search_result: true } }];

  const buildBody = (m: string, useTools: boolean) =>
    JSON.stringify({
      model: m,
      messages: apiMessages,
      temperature: 0.4,
      max_tokens: GLM_MAX_TOKENS,
      stream: true,
      ...(useTools
        ? {
            tools: externalTools || builtInTools,
            ...(externalTools && options.toolChoice ? { tool_choice: options.toolChoice } : {}),
          }
        : {}),
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
  // نفس مبدأ التصحيح فوق: نسجل التفاصيل في السيرفر بس، ونرجع رسالة عامة
  // بهوية mlag للمستخدم من غير أي اسم مزوّد خارجي.
  console.error("[mlag upstream error - provider A]", httpCode, rawJson.slice(0, 500));
  try {
    // سقف يومي (مش لحظي) — "استنى ثانيتين" هنا رسالة غلط ومضللة، لازم نوضح
    // إنه سقف يومي وإن أفضل حل فوري هو موديل تاني، مش إعادة المحاولة بعد شوية.
    const isDailyLimit = /limit_rpd|daily limit/i.test(rawJson);
    if (httpCode === 429 && isDailyLimit) {
      return "موديل mlag-2.1 وصل للحد اليومي المجاني بتاعه دلوقتي — بنحولّك تلقائيًا لموديل تاني عشان تكمل عادي، وممكن تختار mlag-2.1 تاني بكرة لما السقف يترفع.";
    }
    if (httpCode === 401 || httpCode === 403) {
      return "حصلت مشكلة مؤقتة في الاتصال بالخدمة — جرب تاني بعد شوية أو اختار موديل تاني.";
    }
    if (httpCode === 402) {
      return "الخدمة مش متاحة مؤقتًا دلوقتي — جرب موديل تاني من القايمة.";
    }
    if (httpCode === 429) {
      return "الخدمة مزدحمة شوية دلوقتي — استنى ثانيتين وابعت تاني.";
    }
    return "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني، ولو المشكلة استمرت جرب موديل تاني من القايمة.";
  } catch {
    return "حصلت مشكلة في الاتصال بالخدمة — جرب تاني.";
  }
}

/**
 * يجرب موديل malg-2.1 (minimax/minimax-m3:free عبر OpenRouter):
 * بيدور على المفاتيح المتاحة واحد ورا التاني (تدوير + تجاوز أي مفتاح فشل بسبب
 * انتهاء رصيده أو معدل طلباته) لحد ما يلاقي مفتاح شغال أو يخلص كل المفاتيح.
 */
async function negotiateOpenRouter(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  options: NegotiateOptions = {}
): Promise<NegotiationResult> {
  const keys = getOpenRouterKeys();
  if (keys.length === 0) {
    // ملحوظة: الرسالة القديمة كانت بتقول للمستخدم النهائي اسم المزوّد
    // الخارجي (OpenRouter) واسم متغيرات البيئة — دي معلومة لصاحب الموقع بس
    // مش للمستخدم. بنسجلها في اللوج ونرجع رسالة عامة للمستخدم.
    console.error("[mlag config] provider B keys missing — set OPENROUTER_API_KEYS in env");
    return {
      ok: false,
      errorMessage: "موديل mlag-2.1 مش متاح حاليًا — جرب موديل تاني من القايمة.",
    };
  }

  const externalTools = options.tools && options.tools.length > 0 ? options.tools : null;

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
        // لو المستدعي (نقطة الـ API العامة) بعت أدوات بتاعته هو، بنستخدمها هي بدلها.
        ...(useTools
          ? externalTools
            ? { tools: externalTools, ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}) }
            : { tools: [{ type: "openrouter:web_search" }] }
          : {}),
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
  console.error("[mlag upstream error - provider C]", httpCode, rawJson.slice(0, 500));
  try {
    if (httpCode === 401 || httpCode === 403) {
      return "حصلت مشكلة مؤقتة في الاتصال بالخدمة — جرب تاني بعد شوية أو اختار موديل تاني.";
    }
    if (httpCode === 402) {
      return "الخدمة مش متاحة مؤقتًا دلوقتي — جرب موديل تاني من القايمة.";
    }
    if (httpCode === 429) {
      return "الخدمة مزدحمة شوية دلوقتي — استنى ثانيتين وابعت تاني.";
    }
    return "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني، ولو المشكلة استمرت جرب موديل تاني من القايمة.";
  } catch {
    return "حصلت مشكلة في الاتصال بالخدمة — جرب تاني.";
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
async function negotiateXkiro(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  options: NegotiateOptions = {}
): Promise<NegotiationResult> {
  const keys = getXkiroKeys();
  if (keys.length === 0) {
    console.error("[mlag config] provider C keys missing — set XKIRO_API_KEYS in env");
    return {
      ok: false,
      errorMessage: "موديل mlag-2.2 مش متاح حاليًا — جرب موديل تاني من القايمة.",
    };
  }

  const externalTools = options.tools && options.tools.length > 0 ? options.tools : null;

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
        // بوابة xKiro بتدعم function calling عادي (على عكس أداة البحث المدمجة
        // بتاعت GLM/OpenRouter فوق) — فبنبعت أدوات المستدعي زي ما هي لو موجودة.
        ...(externalTools
          ? { tools: externalTools, ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}) }
          : {}),
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
 *
 * ملحوظة مهمة (السبب الحقيقي وراء "malg-2.1 بطل يكتب" اللي ظهر في اللوج):
 * minimax-m3:free على OpenRouter ليه سقف طلبات يومي (limit_rpd) مش لحظي —
 * لما السقف اليومي يخلص، كل مفاتيحنا بترجع 429 مهما جربنا نعيد المحاولة أو
 * ندور مفاتيح، والمستخدم كان بياخد رسالة خطأ ويقف بلا رد خالص. بما إن هوية
 * "mlag" اللي المستخدم بيتكلم معاها واحدة بغض النظر عن المزوّد الحقيقي تحتها
 * (شوف lib/systemPrompt.ts)، لما malg-2.1 أو malg-2.2 يفشلوا فشل كامل (كل
 * المفاتيح خلصت/اتقفلت)، بنرجع تلقائيًا لموديل malg-2 (GLM) — اللي فيه أصلاً
 * منطق fallback داخلي لنفسه — عشان المستخدم ياخد رد فعلي دايمًا بدل ما يوصله
 * خطأ من غير أي تفسير واضح.
 */
export async function negotiateUpstream(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  modelId: ModelId = DEFAULT_MODEL,
  options: NegotiateOptions = {}
): Promise<NegotiationResult> {
  if (modelId === "malg-2.1") {
    const result = await negotiateOpenRouter(apiMessages, signal, options);
    if (result.ok) return result;
    console.error("[mlag] malg-2.1 (provider A) فشل بالكامل — رجعنا لـ malg-2:", result.errorMessage);
    return negotiateGLM(apiMessages, signal, options);
  }
  if (modelId === "malg-2.2") {
    const result = await negotiateXkiro(apiMessages, signal, options);
    if (result.ok) return result;
    console.error("[mlag] malg-2.2 (provider C) فشل بالكامل — رجعنا لـ malg-2:", result.errorMessage);
    return negotiateGLM(apiMessages, signal, options);
  }
  return negotiateGLM(apiMessages, signal, options);
}
