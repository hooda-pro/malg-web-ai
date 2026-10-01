// ---------------------------------------------------------------------------
// Malg-A3 — بوابة موحّدة واحدة: Token Harbor (DeepSeek V4.1 Flash — مجاني)
// ---------------------------------------------------------------------------
// كان فيه قبل كده 3 مزوّدين خارجيين منفصلين (GLM / OpenRouter-minimax /
// xKiro-Qwen) مجمّعين مع بعض كسلسلة fallback واحدة. اتشالوا الثلاثة، وبقى
// كل طلب رايح على مزوّد واحد بس: Token Harbor (بوابة موحّدة متوافقة مع صيغة
// OpenAI)، على موديل DeepSeek V4.1 Flash (مجاني بالكامل، سياق 1M توكن).
// https://tokenharbor.ai/models/deepseek-v4.1-flash:free

const TOKENHARBOR_BASE_URL = "https://tokenharbor.ai/v1/chat/completions";
const TOKENHARBOR_MODEL = "deepseek-v4.1-flash:free";
// حد الإخراج الأقصى الموثّق للموديل هو 128,000 توكن بالظبط — بنطلبه زي ما هو.
const TOKENHARBOR_MAX_TOKENS = 128000;

/**
 * الموديل المتاح للمستخدم من الواجهة — لازم يتطابق مع components/SettingsContext.tsx
 *
 * ملحوظة دمج مهمة: كان عندنا 3 موديلات منفصلة يختارهم المستخدم من القايمة
 * (malg-2 / malg-2.1 / malg-2.2)، كل واحد فيهم فعليًا مزوّد خارجي مختلف.
 * دلوقتي اتدمجوا كلهم في موديل واحد بس بره، اسمه "Malg-A3"، وبقى هو الموديل
 * الافتراضي والوحيد — وجوه، بقى شغال بالكامل على مزوّد واحد بس (Token Harbor
 * / DeepSeek V4.1 Flash) بدل الثلاثة القدام.
 */
export type ModelId = "malg-a3";
export const DEFAULT_MODEL: ModelId = "malg-a3";

/** لسه بتقبل القيم القديمة (malg-2 / malg-2.1 / malg-2.2) من جلسات/localStorage
 * قديمة قبل الدمج، وبترجعها كلها لنفس الموديل الموحّد الجديد. */
export function normalizeModelId(_raw: unknown): ModelId {
  return "malg-a3";
}

/** جزء واحد من محتوى رسالة متعدد الوسائط (نص أو صورة) — صيغة OpenAI-compatible
 * القياسية للـ vision، ومدعومة من Token Harbor / DeepSeek V4.1 Flash (بيدعم
 * الصور فعليًا — شوف lib/attachments.ts::buildApiMessageContent). */
export type ApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ApiMessage {
  role: string;
  /** نص عادي غالبًا. ممكن يبقى مصفوفة أجزاء (نص + صور) لو الرسالة فيها صور
   * مرفقة والموديل بيدعم رؤية — شوف buildApiMessageContent. */
  content: string | ApiContentPart[];
  /** لازمة لرسايل role: "tool" (نتيجة تنفيذ أداة) عشان الموديل يعرف الرد ده
   * بتاع أنهي استدعاء أداة بالظبط — مهم خصوصًا لو أكتر من أداة اتطلبت مع بعض. */
  tool_call_id?: string;
  /** بعض الصيغ بتحط اسم الأداة هنا كمان لرسايل "tool". */
  name?: string;
  /** لرسايل role: "assistant" اللي طلبت استدعاء أداة قبل كده في المحادثة —
   * لازم تتنقل زي ما هي (مش بس content) عشان الموديل يفتكر إيه اللي طلبه. */
  tool_calls?: UpstreamToolCall[];
  /** تفكير الموديل في الجولة اللي طلبت أداة — بعض الموديلات (DeepSeek في وضع التفكير) بتطلب يتنقل معاها. */
  reasoning_content?: string;
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
  /** السيرفر وقف القراءة لأن رصيد المستخدم خلص في نص الرد (shouldStop رجّعت true) */
  stoppedByLimit?: boolean;
  /** موجودة بس لو الموديل طلب استدعاء أداة (function calling) — اختيارية عشان
   * الاستدعاءات القديمة (retry-merge جوه /api/chat و /api/chat/continue) تفضل
   * صحيحة من غير ما تحتاج تتعدل، لأنها أصلاً مش بتستخدم الحقل ده. */
  toolCalls?: UpstreamToolCall[];
}

/**
 * يقرأ ستريم SSE بصيغة OpenAI-compatible (اللي بترجعها بوابة Token Harbor)
 * ويجمّع الـ content و الـ reasoning تدريجيًا، مع استدعاء onDelta لحظيًا لكل
 * جزء يوصل (عشان نقدر نبعته للعميل فورًا). بيجمّع كمان أي tool_calls
 * (function calling) لو الموديل طلب استدعاء أداة — دي بتوصل مجزّأة عبر عدة
 * أجزاء ستريم (id/name مرة واحدة، والـ arguments بيتبني تدريجيًا نص JSON فوق
 * نص) فبنجمعها هنا بالـ index وترجع كاملة في النهاية.
 *
 * ملحوظة مهمة: بعض الموديلات المجانية بترجع أحيانًا استجابة HTTP سليمة (200)
 * لكن الستريم نفسه بيوصل فاضي تمامًا (من غير content ولا حتى reasoning) — ده
 * مش خطأ شبكة، فمهم منعتبروش "نجاح" ونحفظ رسالة وهمية من غير أي محتوى حقيقي.
 * الدالة دي بترجع stoppedByUser بشكل منفصل عشان نفرّق بين إيقاف المستخدم
 * المتعمد وبين استجابة فاضية فعلاً محتاجة إعادة محاولة.
 */
// لو المزوّد فتح الاتصال وبعدين سكت تمامًا (مفيش ولا بايت، حتى تعليقات keep-alive) المدة دي،
// بنقفل القراءة ونكمّل باللي وصل — بدل ما الطلب يتعلّق لحد ما المنصة تقتل الدالة (300 ثانية)
// قبل ما الرد يتحفظ، والمستخدم يشوف الرد واقف وبعدين يختفي. الـ reasoning بيوصل كـ chunks
// باستمرار، فمهلة طويلة زي دي مابتقطعش موديل بيفكر فعلًا.
export const UPSTREAM_IDLE_TIMEOUT_MS = Number(process.env.UPSTREAM_IDLE_TIMEOUT_MS) > 0 ? Number(process.env.UPSTREAM_IDLE_TIMEOUT_MS) : 90_000;

export async function readUpstreamStream(
  response: Response,
  signal: AbortSignal,
  onDelta: (kind: "content" | "reasoning", text: string) => void,
  /** بتتنادى بعد كل جزء: لو رجّعت true بنقفل الاتصال بالموديل فورًا (نفاد رصيد المستخدم في نص الرد). */
  shouldStop?: () => boolean
): Promise<UpstreamStreamResult> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let buffer = "";
  let content = "";
  let reasoning = "";
  let finishReason: string | null = null;
  let stoppedByUser = false;
  let stoppedByLimit = false;
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
    if (stoppedByLimit) return;
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
      if (shouldStop && shouldStop()) {
        stoppedByLimit = true;
        try {
          reader.cancel();
        } catch {
          // تجاهل
        }
        return;
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

  const readWithIdleTimeout = () =>
    new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("upstream idle timeout")), UPSTREAM_IDLE_TIMEOUT_MS);
      reader.read().then(
        (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });

  try {
    while (true) {
      const { done, value } = await readWithIdleTimeout();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
      if (stoppedByLimit) break;
    }
  } catch {
    // انقطاع أثناء القراءة (إيقاف المستخدم أو خطأ اتصال مؤقت أو مهلة خمول) — نقفل الاتصال ونكمّل باللي وصل
    try {
      reader.cancel();
    } catch {
      // تجاهل
    }
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

  // لو اتقطع بسبب الرصيد، أي استدعاء أداة ناقص نتجاهله (مش هننفذه)
  return {
    content,
    reasoning,
    finishReason,
    stoppedByUser,
    stoppedByLimit,
    toolCalls: stoppedByLimit ? [] : toolCalls,
  };
}

/** رسالة صادقة تتكتب للمستخدم لو الموديل رجّع استجابة فاضية بعد كل المحاولات
 * — بدل ما نكذب ونقول "تمت المعالجة بنجاح" من غير أي محتوى فعلي. */
export const EMPTY_RESPONSE_FALLBACK_MESSAGE =
  "معنديش رد فعلي أقدر أكتبهولك دلوقتي 🙏 — الموديل مارجعش أي محتوى بعد أكتر من محاولة (مشكلة مؤقتة في المزوّد الخارجي، مش في سؤالك). جرب تبعت رسالتك تاني كمان شوية، أو اختار موديل تاني من القايمة لو الموضوع مستعجل.";

/** تقدير تقريبي لعدد التوكنز (نفس منطق ChatRepository.estimateTokens في تطبيق الأندرويد). */
export function estimateTokens(...texts: (string | null | undefined)[]): number {
  const sum = texts.reduce((acc, t) => acc + Math.floor((t?.length ?? 0) / 3), 0);
  return sum + 10;
}

export function formatTokens(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
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
  /** تعريفات أدوات على نمط OpenAI — بتتبعت زي ما هي من غير أي تعديل. */
  tools?: unknown[];
  toolChoice?: unknown;
}

// ---------------------------------------------------------------------------
// قارئ عام لمفاتيح API — بيدعم أي عدد من المفاتيح مع تدوير (round robin)
// ---------------------------------------------------------------------------

/**
 * قارئ عام لمفاتيح API بيدعم أي عدد من المفاتيح لأي مزوّد:
 *
 * 1) متغيرات مرقمة منفصلة (الأسهل لو عايز تضيف/تشيل مفتاح لوحده من غير ما تلمس الباقي):
 *      <PREFIX>1 = key-1
 *      <PREFIX>2 = key-2
 *      ... لحد أي رقم عايزه (مفيش حد أقصى)، وبيقبل صيغة الـ underscore زي <PREFIX>_1 برضو
 *
 * 2) أو متغير واحد فيه كل المفاتيح مفصولة بفاصلة/سطر جديد/فاصلة منقوطة:
 *      <PREFIX> = key-1,key-2,key-3
 *
 * @param numberedPrefix جزء الـ regex لاسم المتغير قبل الرقم، مثلاً "TOKENHARBOR_API_KEYS?"
 *   (الـ "?" بعد الـ S بتخليه يقبل الصيغتين KEY و KEYS)
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

/**
 * بيقرأ كل مفاتيح Token Harbor — أضف واحد أو أكتر بأي من الطريقتين:
 *
 *      TOKENHARBOR_API_KEYS1 = th-key-1
 *      TOKENHARBOR_API_KEYS2 = th-key-2
 *      TOKENHARBOR_API_KEYS3 = th-key-3
 *      ... أو
 *      TOKENHARBOR_API_KEYS  = th-key-1,th-key-2,th-key-3
 *
 * ولسه بتقبل TOKENHARBOR_API_KEY (مفرد) لو مفتاح واحد بس.
 */
function getTokenHarborKeys(): string[] {
  return collectApiKeys("TOKENHARBOR_API_KEYS?", "TOKENHARBOR_API_KEYS", "TOKENHARBOR_API_KEY");
}

// عداد بسيط في الذاكرة لتدوير المفاتيح (Round Robin) بين الطلبات المختلفة —
// كل طلب بيبدأ من مفتاح مختلف عن اللي قبله عشان الحمل يتوزع على كل المفاتيح بالتساوي.
let tokenHarborCursor = 0;

function parseTokenHarborError(httpCode: number, rawJson: string): string {
  // نسجل التفاصيل الكاملة في الـ server logs بس، ونرجّع للمستخدم رسالة عامة
  // بهوية MALG، من غير أي اسم مزوّد خارجي أو كود داخلي أو JSON خام.
  console.error("[MALG upstream error]", httpCode, rawJson.slice(0, 500));
  try {
    const isDailyLimit = /limit|quota|rate.?limit/i.test(rawJson) && httpCode === 429;
    if (isDailyLimit) {
      return "الخدمة مزدحمة شوية دلوقتي — استنى ثانيتين وابعت تاني وهيشتغل.";
    }
    if (httpCode === 401 || httpCode === 403) {
      return "حصلت مشكلة مؤقتة في الاتصال بالخدمة — جرب تاني بعد شوية.";
    }
    if (httpCode === 402) {
      return "في مشكلة مؤقتة في تشغيل الرد دلوقتي — جرب تاني كمان شوية.";
    }
    if (httpCode === 429) {
      return "الخدمة مزدحمة شوية دلوقتي — استنى ثانيتين وابعت تاني.";
    }
    return "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني كمان شوية.";
  } catch {
    return "حصلت مشكلة في الاتصال بالخدمة — جرب تاني.";
  }
}

/**
 * يجرب موديل Malg-A3 (DeepSeek V4.1 Flash — مجاني — عبر بوابة Token Harbor):
 * بيدور على المفاتيح المتاحة واحد ورا التاني (تدوير + تجاوز أي مفتاح فشل بسبب
 * انتهاء رصيده أو معدل طلباته) لحد ما يلاقي مفتاح شغال أو يخلص كل المفاتيح.
 *
 * ملحوظة عن البحث في الإنترنت: بوابة Token Harbor مالهاش أداة بحث جاهزة
 * تشتغل من عندها هي (زي ما كان GLM/OpenRouter عندهم) — بتدعم بس "function
 * calling" عادي. طبقة البحث الحقيقي (lib/webSearch.ts، عن طريق Tavily) هي
 * اللي بتغطي ده: بتجيب النتايج وتحقنها كـ context في الرسايل قبل ما نكلم
 * الموديل، فمفيش حاجة إضافية لازمة هنا.
 */
async function negotiateTokenHarbor(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  options: NegotiateOptions = {}
): Promise<NegotiationResult> {
  const keys = getTokenHarborKeys();
  if (keys.length === 0) {
    console.error("[MALG config] Token Harbor keys missing — set TOKENHARBOR_API_KEYS in env");
    return {
      ok: false,
      errorMessage: "موديل MALG مش متاح حاليًا — تأكد من إعداد الخدمة وحاول تاني.",
    };
  }

  const externalTools = options.tools && options.tools.length > 0 ? options.tools : null;

  const call = (key: string) =>
    fetch(TOKENHARBOR_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TOKENHARBOR_MODEL,
        messages: apiMessages,
        temperature: 0.4,
        max_tokens: TOKENHARBOR_MAX_TOKENS,
        stream: true,
        // بوابة Token Harbor بتدعم function calling عادي — فبنبعت أدوات
        // المستدعي زي ما هي لو موجودة (بحل محل أداة البحث المدمجة بتاعت
        // الموقع، مش بيتخلط معاها).
        ...(externalTools
          ? { tools: externalTools, ...(options.toolChoice ? { tool_choice: options.toolChoice } : {}) }
          : {}),
      }),
      signal,
    });

  let lastErrorCode = 0;
  let lastErrorText = "";

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(tokenHarborCursor + i) % keys.length];
    let response: Response;
    try {
      response = await call(key);
    } catch (e) {
      if (signal.aborted) throw e;
      continue; // مشكلة شبكة مؤقتة — جرّب المفتاح اللي بعده
    }

    if (response.ok) {
      tokenHarborCursor = (tokenHarborCursor + i + 1) % keys.length;
      return { ok: true, response };
    }

    lastErrorCode = response.status;
    try {
      lastErrorText = await response.text();
    } catch {
      // تجاهل
    }
    // 429 (تجاوز الحد) أو 402 (رصيد خلص) أو 401/403 (مفتاح لاغي) — جرّب المفتاح اللي بعده
    if ([401, 402, 403, 429].includes(response.status)) continue;
  }

  return { ok: false, errorMessage: parseTokenHarborError(lastErrorCode || 502, lastErrorText) };
}

/**
 * نقطة الدخول الموحدة: بما إن الموديل بقى واحد بس (Malg-A3) وبيشتغل بالكامل
 * على مزوّد واحد (Token Harbor / DeepSeek V4.1 Flash)، الباراميتر modelId
 * اتسيب هنا للتوافق مع أي كود قديم (سيرفرات API عامة قديمة، جلسات محفوظة)
 * بيبعت قيمة موديل، لكنه اتجاهل فعليًا — كل طلب بيتوجه لـ negotiateTokenHarbor.
 */
export async function negotiateUpstream(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  modelId: ModelId = DEFAULT_MODEL,
  options: NegotiateOptions = {}
): Promise<NegotiationResult> {
  void modelId;
  return negotiateTokenHarbor(apiMessages, signal, options);
}
