// ---------------------------------------------------------------------------
// Malg-A3 — مزوّد ديناميكي: الأدمن بيغيّره من لوحة الإدارة (lib/provider.ts)
// ---------------------------------------------------------------------------
// التعليمات (system prompt) والـ agent loop والبحث والتخزين ثابتين زي ما هما،
// اللي بيتغيّر بس: البروتوكول + الرابط (baseUrl) + اسم الموديل + مفاتيح الـ API.
//
// النظام Protocol-agnostic:
// - Provider configuration (lib/provider.ts): الاسم + البروتوكول + الرابط + الموديل + المفاتيح
// - Protocol adapter (هنا): تحويل MALG internal format ↔ صيغة البروتوكول الخارجي
// - MALG internal format: ApiMessage[] (chat-style) + UpstreamStreamResult الموحّد
//
// البروتوكولات المدعومة حاليًا:
// - chat_completions: OpenAI Chat Completions (messages/model/temperature/max_tokens/stream)
// - responses: OpenAI Responses API (input/model/temperature/max_output_tokens/stream)
// التصميم يسمح بإضافة بروتوكولات أخرى عبر نفس الـ adapter بدون إعادة بناء.

import { getModelProvider, resolveProviderEndpoint, type ProviderProtocol } from "./provider";

/**
 * الموديل المتاح للمستخدم من الواجهة — لازم يتطابق مع components/SettingsContext.tsx
 *
 * ملحوظة دمج مهمة: كان عندنا 3 موديلات منفصلة يختارهم المستخدم من القايمة
 * (malg-2 / malg-2.1 / malg-2.2)، كل واحد فيهم فعليًا مزوّد خارجي مختلف.
 * دلوقتي اتدمجوا كلهم في موديل واحد بس بره، اسمه "Malg-A3"، وبقى هو الموديل
 * الافتراضي والوحيد — وجوه، بقى شغال بالكامل على مزوّد واحد بس (Token Harbor
 * / DeepSeek V4.1 Flash) بدل الثلاثة القدام.
 */
export type ModelId = string;
export const DEFAULT_MODEL: ModelId = "malg-a3";

/** توحيد معرف الموديل القادم من الواجهة/الجلسات/مفاتيح API:
 * - القيم القديمة (malg-2 / malg-2.1 / malg-2.2) → "malg-a3" للتوافق الخلفي.
 * - أي slug صالح [a-z0-9-_] يُقبل كما هو (الموديلات التي يضيفها الأدمن).
 * - الفارغ/غير الصالح → الموديل الافتراضي. */
export function normalizeModelId(_raw: unknown): ModelId {
  const t = String(_raw ?? "").trim().toLowerCase();
  if (t === "malg-2" || t === "malg-2.1" || t === "malg-2.2") return DEFAULT_MODEL;
  if (/^[a-z0-9][a-z0-9-_]{0,62}[a-z0-9]$/.test(t) || /^[a-z0-9]$/.test(t)) return t;
  return DEFAULT_MODEL;
}

/** جزء واحد من محتوى رسالة متعدد الوسائط (نص أو صورة) — صيغة OpenAI-compatible
 * القياسية للـ vision، ومدعومة من Token Harbor / DeepSeek V4.1 Flash (بيدعم
 * الصور فعليًا — شوف lib/attachments.ts::buildApiMessageContent). */
export type ApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } };

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

// ---------------------------------------------------------------------------
// Protocol adapters: تحويل MALG internal ↔ صيغة البروتوكول الخارجي
// ---------------------------------------------------------------------------

/** عنصر input بصيغة Responses API */
type ResponsesInputItem =
  | { role: string; content: string | Array<{ type: string; text?: string; image_url?: string }> }
  | { type: "function_call"; call_id: string; name: string; arguments: string }
  | { type: "function_call_output"; call_id: string; output: string };

function apiContentToText(content: string | ApiContentPart[]): string {
  if (typeof content === "string") return content;
  return content
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "image_url") return "[image]";
      if (p.type === "video_url") return "[video]";
      return "";
    })
    .join("\n");
}

function apiContentToResponsesContent(
  content: string | ApiContentPart[]
): string | Array<{ type: string; text?: string; image_url?: string }> {
  if (typeof content === "string") return content;
  if (content.length === 0) return "";
  // لو كله نص، ابعته كنص مدمج (أبسط وأوسع توافقًا)
  const hasImage = content.some((p) => p.type === "image_url");
  if (!hasImage) return content.map((p) => (p.type === "text" ? p.text : "")).join("\n");
  return content.map((p) => {
    if (p.type === "text") return { type: "input_text", text: p.text };
    if (p.type === "image_url") return { type: "input_image", image_url: p.image_url.url };
    return { type: "input_text", text: "[video]" };
  });
}

/**
 * تحويل رسائل MALG الداخلية (chat-style) إلى input بصيغة Responses API.
 * يحافظ على: system/user/assistant + صور + function_call + function_call_output.
 * حقل reasoning_content الداخلي لا يُرسل (Responses يدير التفكير داخليًا).
 */
export function toResponsesInput(messages: ApiMessage[]): ResponsesInputItem[] {
  const out: ResponsesInputItem[] = [];
  for (const m of messages) {
    const role = String(m.role ?? "");
    if (role === "tool") {
      out.push({
        type: "function_call_output",
        call_id: String(m.tool_call_id ?? ""),
        output: apiContentToText((m.content ?? "") as string | ApiContentPart[]),
      });
      continue;
    }
    if (role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const text = apiContentToText((m.content ?? "") as string | ApiContentPart[]);
      if (text && text.trim()) {
        out.push({ role: "assistant", content: text });
      }
      for (const tc of m.tool_calls) {
        out.push({
          type: "function_call",
          call_id: String(tc?.id ?? ""),
          name: String(tc?.function?.name ?? ""),
          arguments: String(tc?.function?.arguments ?? ""),
        });
      }
      continue;
    }
    // system / user / assistant عادية
    const safeRole = role === "system" || role === "user" || role === "assistant" ? role : "user";
    out.push({
      role: safeRole,
      content: apiContentToResponsesContent((m.content ?? "") as string | ApiContentPart[]),
    });
  }
  return out;
}

/**
 * تحويل تعريفات أدوات chat-style إلى Responses-style.
 * chat: {type:"function", function:{name,description,parameters}}
 * responses: {type:"function", name,description,parameters}
 * أي تعريف غير معروف يُمرَّر كما هو (تسامح مع بوابات مخصصة).
 */
export function toResponsesTools(tools: unknown[]): unknown[] {
  return tools.map((t) => {
    if (t && typeof t === "object") {
      const obj = t as Record<string, unknown>;
      if (obj.type === "function" && obj.function && typeof obj.function === "object") {
        const fn = obj.function as Record<string, unknown>;
        return {
          type: "function",
          name: fn.name,
          ...(fn.description !== undefined ? { description: fn.description } : {}),
          ...(fn.parameters !== undefined ? { parameters: fn.parameters } : {}),
        };
      }
    }
    return t;
  });
}

/** يبني body الطلب حسب البروتوكول — المستخدم داخليًا دائمًا ApiMessage[] */
export function buildUpstreamBody(
  protocol: ProviderProtocol,
  opts: { model: string; messages: ApiMessage[]; temperature: number; maxTokens: number; stream: boolean; tools?: unknown[]; toolChoice?: unknown }
): Record<string, unknown> {
  if (protocol === "responses") {
    const body: Record<string, unknown> = {
      model: opts.model,
      input: toResponsesInput(opts.messages),
      temperature: opts.temperature,
      max_output_tokens: opts.maxTokens,
      stream: opts.stream,
    };
    if (opts.tools && opts.tools.length > 0) {
      body.tools = toResponsesTools(opts.tools);
      if (opts.toolChoice !== undefined) body.tool_choice = opts.toolChoice;
    }
    return body;
  }
  // chat_completions (السلوك الأصلي — لم يتغير)
  return {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    stream: opts.stream,
    ...(opts.tools && opts.tools.length > 0
      ? { tools: opts.tools, ...(opts.toolChoice !== undefined ? { tool_choice: opts.toolChoice } : {}) }
      : {}),
  };
}

/** يبني endpoint + body معًا — يُستخدم في negotiate وفي اختبار الاتصال */
export function buildUpstreamRequest(
  provider: { baseUrl: string; protocol: ProviderProtocol; model: string; temperature: number; maxTokens: number },
  messages: ApiMessage[],
  opts: { stream: boolean; tools?: unknown[]; toolChoice?: unknown; maxTokensOverride?: number }
): { endpoint: string; body: Record<string, unknown> } {
  const endpoint = resolveProviderEndpoint(provider.baseUrl, provider.protocol);
  const body = buildUpstreamBody(provider.protocol, {
    model: provider.model,
    messages,
    temperature: provider.temperature,
    maxTokens: opts.maxTokensOverride ?? provider.maxTokens,
    stream: opts.stream,
    tools: opts.tools,
    toolChoice: opts.toolChoice,
  });
  return { endpoint, body };
}

// ---------------------------------------------------------------------------
// استخراج نص من رد Responses غير-stream (لاختبار الاتصال)
// ---------------------------------------------------------------------------

/** يستخرج عينة نصية من رد Responses JSON (غير stream) */
export function extractResponsesSample(json: unknown): string {
  try {
    const out = (json as Record<string, unknown>)?.output;
    if (Array.isArray(out)) {
      for (const item of out) {
        const it = item as Record<string, unknown>;
        if (it?.type === "message" && Array.isArray(it.content)) {
          for (const c of it.content as Array<Record<string, unknown>>) {
            if ((c?.type === "output_text" || c?.type === "text") && typeof c?.text === "string") {
              const t = (c.text as string).trim();
              if (t) return t.slice(0, 200);
            }
          }
        }
      }
      // fallback: أول نص موجود في أي مكان
      const flat = JSON.stringify(out);
      const m = flat.match(/"text"\s*:\s*"([^"]{1,200})/);
      if (m) return m[1].slice(0, 200);
    }
    // بعض البوابات ترجع {response:{output:[...]}} أو {text:...}
    const resp = (json as Record<string, unknown>)?.response as Record<string, unknown> | undefined;
    if (resp && Array.isArray(resp.output)) return extractResponsesSample({ output: resp.output });
    if (typeof (json as Record<string, unknown>)?.text === "string") {
      return String((json as Record<string, unknown>).text).slice(0, 200);
    }
  } catch {
    // تجاهل
  }
  return "";
}

// ---------------------------------------------------------------------------
// تصنيف أخطاء المزوّد — للتشخيص في logs + تلميحات الأدمن (بدون تسريب مفاتيح)
// ---------------------------------------------------------------------------

export type UpstreamErrorCategory =
  | "invalid_api_key"
  | "forbidden_model"
  | "wrong_endpoint"
  | "unsupported_protocol"
  | "quota_payment"
  | "rate_limit"
  | "model_not_found"
  | "bad_request"
  | "server_error"
  | "unknown";

export interface ClassifiedError {
  category: UpstreamErrorCategory;
  /** رسالة آمنة للمستخدم النهائي (بدون أسرار أو تفاصيل داخلية) */
  userMessage: string;
}

const SAFE_MESSAGES: Record<UpstreamErrorCategory, string> = {
  invalid_api_key: "حصلت مشكلة مؤقتة في الاتصال بالخدمة — جرب تاني بعد شوية.",
  forbidden_model: "حصلت مشكلة مؤقتة في الاتصال بالخدمة — جرب تاني بعد شوية.",
  wrong_endpoint: "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني كمان شوية.",
  unsupported_protocol: "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني كمان شوية.",
  quota_payment: "في مشكلة مؤقتة في تشغيل الرد دلوقتي — جرب تاني كمان شوية.",
  rate_limit: "الخدمة مزدحمة شوية دلوقتي — استنى ثانيتين وابعت تاني.",
  model_not_found: "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني كمان شوية.",
  bad_request: "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني كمان شوية.",
  server_error: "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني كمان شوية.",
  unknown: "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني كمان شوية.",
};

/** يميّز سبب الفشل من status + نص الخطأ الخام — لا يفترض أن كل 403 سببه المفتاح */
export function classifyUpstreamError(httpCode: number, rawText: string): ClassifiedError {
  const body = String(rawText ?? "").toLowerCase();
  const has = (...res: RegExp[]) => res.some((r) => r.test(body));

  if (httpCode === 402) return { category: "quota_payment", userMessage: SAFE_MESSAGES.quota_payment };
  if (httpCode === 429) {
    const daily = /limit|quota|rate.?limit/i.test(rawText ?? "");
    return {
      category: "rate_limit",
      userMessage: daily && httpCode === 429 ? "الخدمة مزدحمة شوية دلوقتي — استنى ثانيتين وابعت تاني وهيشتغل." : SAFE_MESSAGES.rate_limit,
    };
  }
  if (httpCode === 401) {
    return { category: "invalid_api_key", userMessage: SAFE_MESSAGES.invalid_api_key };
  }
  if (httpCode === 403) {
    if (has(/quota|billing|payment|balance|credit|insufficient|out of|exceed/i)) {
      return { category: "quota_payment", userMessage: SAFE_MESSAGES.quota_payment };
    }
    if (has(/rate.?limit|too many/i)) {
      return { category: "rate_limit", userMessage: SAFE_MESSAGES.rate_limit };
    }
    if (has(/model|access|permission|forbidden|not (allowed|authorized|entitled)|wrong|unsupported|protocol/i)) {
      return { category: "forbidden_model", userMessage: SAFE_MESSAGES.forbidden_model };
    }
    // 403 غامض (مثل OpenCode /inference/...) — غالبًا رفض مفتاح/صلاحية نموذج،
    // لكن لا نفترض: نوسمه invalid_api_key للتوافق مع السلوك القديم مع تسجيل التفاصيل
    return { category: "invalid_api_key", userMessage: SAFE_MESSAGES.invalid_api_key };
  }
  if (httpCode === 404) {
    if (has(/chat\/completions|responses|endpoint|path|route|url|not.?found|unknown path|no route/i) && !has(/model/i)) {
      return { category: "wrong_endpoint", userMessage: SAFE_MESSAGES.wrong_endpoint };
    }
    if (has(/model/i)) {
      return { category: "model_not_found", userMessage: SAFE_MESSAGES.model_not_found };
    }
    return { category: "wrong_endpoint", userMessage: SAFE_MESSAGES.wrong_endpoint };
  }
  if (httpCode === 400 || httpCode === 405 || httpCode === 422) {
    if (has(/responses|unsupported|unknown|does not support|not supported|protocol|input.*(invalid|unknown)|unexpected.*input/i)) {
      return { category: "unsupported_protocol", userMessage: SAFE_MESSAGES.unsupported_protocol };
    }
    if (has(/model/i)) {
      return { category: "model_not_found", userMessage: SAFE_MESSAGES.model_not_found };
    }
    return { category: "bad_request", userMessage: SAFE_MESSAGES.bad_request };
  }
  if (httpCode >= 500) return { category: "server_error", userMessage: SAFE_MESSAGES.server_error };
  if (httpCode === 0) return { category: "unknown", userMessage: "حصلت مشكلة في الاتصال بالخدمة — جرب تاني." };
  return { category: "unknown", userMessage: SAFE_MESSAGES.unknown };
}

export interface UpstreamLogContext {
  providerName: string;
  model: string;
  protocol: ProviderProtocol;
  endpoint: string;
}

/** تسجيل تشخيصي مفيد بدون تسريب الـ API key */
export function logUpstreamError(ctx: UpstreamLogContext, httpCode: number, rawText: string, extra?: string) {
  const classified = classifyUpstreamError(httpCode, rawText);
  console.error(
    `[MALG upstream error] provider="${ctx.providerName}" model="${ctx.model}" protocol=${ctx.protocol} endpoint=${ctx.endpoint} status=${httpCode} category=${classified.category} body=${String(rawText ?? "").slice(0, 500)}${extra ? ` ${extra}` : ""}`
  );
  return classified;
}

/**
 * يقرأ ستريم SSE ويجمّع الـ content و الـ reasoning تدريجيًا، مع استدعاء onDelta لحظيًا لكل
 * جزء يوصل (عشان نقدر نبعته للعميل فورًا). بيجمّع كمان أي tool_calls
 * (function calling) لو الموديل طلب استدعاء أداة — دي بتوصل مجزّأة عبر عدة
 * أجزاء ستريم (id/name مرة واحدة، والـ arguments بيتبني تدريجيًا نص JSON فوق
 * نص) فبنجمعها هنا بالـ index وترجع كاملة في النهاية.
 *
 * يدعم بروتوكولين ويحوّلهما لنفس الـ internal format:
 * - chat_completions: choices[0].delta.{content, reasoning_content, tool_calls}
 * - responses: أحداث response.output_text.delta / reasoning deltas / function_call_arguments.delta
 *   (مع fallback متبادل: لو بوابة أرسلت الشكل الآخر، يُحاول فهمه أيضًا)
 *
 * ملحوظة مهمة: بعض الموديلات المجانية بترجع أحيانًا استجابة HTTP سليمة (200)
 * لكن الستريم نفسه بيوصل فاضي تمامًا (من غير content ولا حتى reasoning) — ده
 * مش خطأ شبكة، فمهم منعتبروش "نجاح" ونحفظ رسالة وهمية من غير أي محتوى حقيقي.
 * الدالة دي بترجع stoppedByUser بشكل منفصل عشان نفرّق بين إيقاف المستخدم
 * المتعمد وبين استجابة فاضية فعلاً محتاجة إعادة محاولة.
 */
// لو المزوّد فتح الاتصال وبعدين سكت تمامًا (مفيش ولا بايت، حتى تعليقات keep-alive) المدة دي،
// بنقفل القراءة ونكمّل باللي وصل — بدل ما الطلب يتعلّق لحد ما المنصة تقتل الدالة (300 ثانية على Hobby)
// قبل ما الرد يتحفظ، والمستخدم يشوف الرد واقف وبعدين يختفي. الـ reasoning بيوصل كـ chunks
// باستمرار، فمهلة طويلة زي دي مابتقطعش موديل بيفكر فعلًا.
// دقيقتين افتراضي (تناسب نافذة 300 ثانية): الـ reasoning بيوصل كـ chunks باستمرار
// فمابتقطعش موديل بيفكر فعلًا، وبتحمي بس من التعليق الحقيقي. قابلة للتغيير عبر UPSTREAM_IDLE_TIMEOUT_MS.
export const UPSTREAM_IDLE_TIMEOUT_MS = Number(process.env.UPSTREAM_IDLE_TIMEOUT_MS) > 0 ? Number(process.env.UPSTREAM_IDLE_TIMEOUT_MS) : 120_000;

export async function readUpstreamStream(
  response: Response,
  signal: AbortSignal,
  onDelta: (kind: "content" | "reasoning", text: string) => void,
  /** بتتنادى بعد كل جزء: لو رجّعت true بنقفل الاتصال بالموديل فورًا (نفاد رصيد المستخدم في نص الرد). */
  shouldStop?: () => boolean,
  /** بروتوكول المزوّد — افتراضي chat_completions للتوافق الخلفي */
  protocol: ProviderProtocol = "chat_completions"
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
  // مجمّع استدعاءات Responses API حسب output_index
  const responsesCalls = new Map<number, { id: string; name: string; arguments: string }>();

  const onAbort = () => {
    stoppedByUser = true;
    try {
      reader.cancel();
    } catch {
      // تجاهل
    }
  };
  signal.addEventListener("abort", onAbort);

  const accChatToolCalls = (arr: Array<unknown>) => {
    for (const tc of arr) {
      const t = tc as Record<string, unknown>;
      const idx = typeof t?.index === "number" ? (t.index as number) : toolCallsAcc.length;
      if (!toolCallsAcc[idx]) toolCallsAcc[idx] = { id: "", name: "", arguments: "" };
      if (typeof t?.id === "string") toolCallsAcc[idx].id = t.id as string;
      const fn = t?.function as Record<string, unknown> | undefined;
      if (typeof fn?.name === "string") toolCallsAcc[idx].name += fn.name as string;
      if (typeof fn?.arguments === "string") toolCallsAcc[idx].arguments += fn.arguments as string;
    }
  };

  const processChatJson = (json: Record<string, unknown>) => {
    const choice = (json?.choices as Array<Record<string, unknown>> | undefined)?.[0] as Record<string, unknown> | undefined;
    if (choice?.finish_reason && typeof choice.finish_reason === "string") finishReason = choice.finish_reason as string;
    const delta = choice?.delta as Record<string, unknown> | undefined;
    if (typeof delta?.reasoning_content === "string" && (delta.reasoning_content as string)) {
      const t = delta.reasoning_content as string;
      reasoning += t;
      onDelta("reasoning", t);
    } else if (typeof delta?.reasoning === "string" && (delta.reasoning as string)) {
      // بعض البوابات ترجع reasoning بدل reasoning_content
      const t = delta.reasoning as string;
      reasoning += t;
      onDelta("reasoning", t);
    }
    if (typeof delta?.content === "string" && (delta.content as string)) {
      const t = delta.content as string;
      content += t;
      onDelta("content", t);
    }
    if (Array.isArray(delta?.tool_calls)) {
      accChatToolCalls(delta.tool_calls as Array<unknown>);
    }
  };

  const processResponsesJson = (json: Record<string, unknown>) => {
    const type = typeof json?.type === "string" ? (json.type as string) : "";
    if (!type) {
      // بدون type: قد يكون fallback (بعض البوابات ترجع choices حتى في وضع responses)
      if (Array.isArray(json?.choices)) {
        processChatJson(json);
      }
      return;
    }
    // نص متدفق
    if (type === "response.output_text.delta") {
      const d = json.delta;
      if (typeof d === "string" && d) {
        content += d;
        onDelta("content", d);
      }
      return;
    }
    // تفكير متدفق (أسماء متعددة حسب المزوّد)
    if (type.includes("reasoning") && type.endsWith(".delta")) {
      const d = (json.delta ?? json.text ?? json.summary) as unknown;
      if (typeof d === "string" && d) {
        reasoning += d;
        onDelta("reasoning", d);
      }
      return;
    }
    // بداية عنصر function_call
    if (type === "response.output_item.added") {
      const item = json.item as Record<string, unknown> | undefined;
      const outputIndex = typeof json.output_index === "number" ? (json.output_index as number) : 0;
      if (item && item.type === "function_call") {
        const cur = responsesCalls.get(outputIndex) ?? { id: "", name: "", arguments: "" };
        if (typeof item.call_id === "string") cur.id = item.call_id as string;
        else if (typeof item.id === "string" && !cur.id) cur.id = item.id as string;
        if (typeof item.name === "string") cur.name = item.name as string;
        if (typeof item.arguments === "string") cur.arguments = item.arguments as string;
        responsesCalls.set(outputIndex, cur);
      }
      return;
    }
    // وسائط الدالة متدفقة
    if (type === "response.function_call_arguments.delta") {
      const outputIndex = typeof json.output_index === "number" ? (json.output_index as number) : 0;
      const d = json.delta;
      if (typeof d === "string" && d) {
        const cur = responsesCalls.get(outputIndex) ?? { id: "", name: "", arguments: "" };
        cur.arguments += d;
        responsesCalls.set(outputIndex, cur);
      }
      return;
    }
    if (type === "response.function_call_arguments.done") {
      const outputIndex = typeof json.output_index === "number" ? (json.output_index as number) : 0;
      const args = json.arguments;
      if (typeof args === "string") {
        const cur = responsesCalls.get(outputIndex) ?? { id: "", name: "", arguments: "" };
        cur.arguments = args;
        responsesCalls.set(outputIndex, cur);
      }
      return;
    }
    // اكتمال عنصر (يحمل الاستدعاء الكامل كاحتياطي)
    if (type === "response.output_item.done") {
      const item = json.item as Record<string, unknown> | undefined;
      const outputIndex = typeof json.output_index === "number" ? (json.output_index as number) : 0;
      if (item && item.type === "function_call") {
        const cur = responsesCalls.get(outputIndex) ?? { id: "", name: "", arguments: "" };
        if (typeof item.call_id === "string") cur.id = item.call_id as string;
        else if (typeof item.id === "string" && !cur.id) cur.id = item.id as string;
        if (typeof item.name === "string" && !cur.name) cur.name = item.name as string;
        if (typeof item.arguments === "string" && !cur.arguments) cur.arguments = item.arguments as string;
        responsesCalls.set(outputIndex, cur);
      }
      // نص مكتمل كاحتياطي لو لم تصل deltas
      if (item && item.type === "message" && !content) {
        const c = item.content as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(c)) {
          for (const part of c) {
            if ((part.type === "output_text" || part.type === "text") && typeof part.text === "string" && (part.text as string)) {
              content += part.text as string;
              onDelta("content", part.text as string);
            }
          }
        }
      }
      return;
    }
    // نهاية الرد — نلتقط finish + أي محتوى فائت كاحتياطي
    if (type === "response.completed" || type === "response.incomplete" || type === "response.failed") {
      if (type === "response.completed") finishReason = finishReason ?? "stop";
      else if (type === "response.incomplete") {
        // أي incomplete معناه الرد اتقطع والمفروض يكمل — لازم finishReason تبقى
        // "length" عشان زرار «كمّل» يظهر وعلامة is_truncated تتسجل. (حتى لو السبب
        // فلترة محتوى، التكملة سلوكها آمن: الموديل بيرفض تاني باختصار.)
        finishReason = finishReason ?? "length";
      }
      // احتياطي: استخراج المحتوى الكامل لو الـ deltas لم تصل
      const resp = (json.response ?? json) as Record<string, unknown>;
      const output = resp?.output;
      if (!content && Array.isArray(output)) {
        for (const item of output as Array<Record<string, unknown>>) {
          if (item?.type === "message" && Array.isArray(item.content)) {
            for (const part of item.content as Array<Record<string, unknown>>) {
              if ((part?.type === "output_text" || part?.type === "text") && typeof part?.text === "string") {
                const t = part.text as string;
                if (t && !content.includes(t)) {
                  content += t;
                  onDelta("content", t);
                }
              }
            }
          }
          if (item?.type === "function_call") {
            const idx = responsesCalls.size;
            if (![...responsesCalls.values()].some((v) => v.name === item.name)) {
              responsesCalls.set(idx, {
                id: String(item.call_id ?? item.id ?? `call_${idx}`),
                name: String(item.name ?? ""),
                arguments: String(item.arguments ?? ""),
              });
            }
          }
        }
      }
      return;
    }
    // أحداث أخرى (created/in_progress/content_part.added/...) — تجاهل
  };

  const processLine = (rawLine: string) => {
    if (stoppedByLimit) return;
    const line = rawLine.trim();
    if (!line || line.startsWith(":") || !line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return;
    try {
      const json = JSON.parse(data);
      // توجيه حسب البروتوكول مع fallback متبادل للمتانة
      if (protocol === "responses") {
        if (json && typeof json.type === "string" && String(json.type).startsWith("response.")) {
          processResponsesJson(json);
        } else if (Array.isArray(json?.choices)) {
          processChatJson(json);
        } else {
          // شكل غير متوقع: جرّب الاثنين
          processResponsesJson(json);
          if (Array.isArray(json?.choices)) processChatJson(json);
        }
      } else {
        if (Array.isArray(json?.choices)) {
          processChatJson(json);
        } else if (json && typeof json.type === "string" && String(json.type).startsWith("response.")) {
          // بوابة أرسلت أحداث responses رغم أن البروتوكول chat — افهمها بدل رميها
          processResponsesJson(json);
        }
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

  // دمج استدعاءات Responses (حسب output_index) مع تجميع chat
  if (responsesCalls.size > 0) {
    const sorted = [...responsesCalls.entries()].sort((a, b) => a[0] - b[0]);
    sorted.forEach(([, tc], i) => {
      toolCallsAcc[i] = {
        id: tc.id || toolCallsAcc[i]?.id || `call_${i}`,
        name: tc.name || toolCallsAcc[i]?.name || "",
        arguments: (toolCallsAcc[i]?.arguments || "") + (tc.arguments || ""),
      };
    });
  }

  const toolCalls: UpstreamToolCall[] = toolCallsAcc
    .map((tc, i) =>
      tc && (tc.name || tc.arguments || tc.id)
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
  | { ok: true; response: Response; protocol: ProviderProtocol; endpoint: string; providerName: string; model: string }
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

// عداد بسيط في الذاكرة لتدوير المفاتيح (Round Robin) بين الطلبات المختلفة —
// كل طلب بيبدأ من مفتاح مختلف عن اللي قبله عشان الحمل يتوزع على كل المفاتيح بالتساوي.
let providerCursor = 0;

function parseUpstreamError(
  httpCode: number,
  rawJson: string,
  ctx?: UpstreamLogContext
): string {
  // نسجل التفاصيل الكاملة في الـ server logs بس (مع provider/model/protocol/endpoint
  // بدون الـ API key)، ونرجّع للمستخدم رسالة عامة بهوية MALG.
  if (ctx) {
    logUpstreamError(ctx, httpCode, rawJson);
  } else {
    console.error("[MALG upstream error]", httpCode, rawJson.slice(0, 500));
  }
  return classifyUpstreamError(httpCode, rawJson).userMessage;
}

/**
 * التفاوض مع المزوّد النشط (من لوحة الأدمن أو env fallback):
 * بيدور على المفاتيح المتاحة واحد ورا التاني (تدوير + تجاوز أي مفتاح فشل
 * بسبب انتهاء رصيده أو معدل طلباته) لحد ما يلاقي مفتاح شغال أو يخلص كل المفاتيح.
 *
 * التعليمات والـ agent loop ثابتين — اللي بيتغيّر بس البروتوكول + الرابط + الموديل + المفتاح.
 * الطلب يُبنى حسب البروتوكول (Chat: messages/max_tokens — Responses: input/max_output_tokens)،
 * والرد يُقرأ عبر readUpstreamStream بنفس البروتوكول ليتحوّل لنفس الـ internal format.
 *
 * ملحوظة عن البحث: المزودات المتوافقة مع OpenAI بتدعم function calling عادي.
 * طبقة البحث الحقيقي (lib/webSearch.ts، عن طريق Tavily) بتجيب النتايج وتحطها
 * كـ context قبل ما نكلم الموديل، فمفيش حاجة إضافية لازمة هنا.
 */
async function negotiateDynamicProvider(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  options: NegotiateOptions = {},
  modelId: ModelId = DEFAULT_MODEL
): Promise<NegotiationResult> {
  const provider = await getModelProvider(modelId);
  const keys = provider.apiKeys;
  if (keys.length === 0) {
    console.error(`[MALG config] No API keys for provider "${provider.name}" protocol=${provider.protocol} model=${provider.model} — غيّر المزوّد من لوحة الأدمن`);
    return {
      ok: false,
      errorMessage: "موديل MALG مش متاح حاليًا — تأكد من إعداد الخدمة وحاول تاني.",
    };
  }

  const externalTools = options.tools && options.tools.length > 0 ? options.tools : null;
  const { endpoint, body } = buildUpstreamRequest(
    { baseUrl: provider.baseUrl, protocol: provider.protocol, model: provider.model, temperature: provider.temperature, maxTokens: provider.maxTokens },
    apiMessages,
    { stream: true, tools: externalTools ?? undefined, toolChoice: options.toolChoice }
  );
  const ctx: UpstreamLogContext = {
    providerName: provider.name,
    model: provider.model,
    protocol: provider.protocol,
    endpoint,
  };

  const call = (key: string) =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

  let lastErrorCode = 0;
  let lastErrorText = "";

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(providerCursor + i) % keys.length];
    let response: Response;
    try {
      response = await call(key);
    } catch (e) {
      if (signal.aborted) throw e;
      continue; // مشكلة شبكة مؤقتة — جرّب المفتاح اللي بعده
    }

    if (response.ok) {
      providerCursor = (providerCursor + i + 1) % keys.length;
      return { ok: true, response, protocol: provider.protocol, endpoint, providerName: provider.name, model: provider.model };
    }

    lastErrorCode = response.status;
    try {
      lastErrorText = await response.text();
    } catch {
      // تجاهل
    }
    // أخطاء لا فائدة من تجربة مفاتيح أخرى معها (نفس الـ endpoint/البروتوكول):
    // endpoint غلط / بروتوكول غير مدعوم / موديل مش موجود / طلب malformed.
    const cat = classifyUpstreamError(response.status, lastErrorText).category;
    if (cat === "wrong_endpoint" || cat === "unsupported_protocol" || cat === "model_not_found" || cat === "bad_request") {
      break;
    }
    // 401/402/403/429/5xx — جرّب المفتاح اللي بعده (نفس السلوك القديم)
  }

  return { ok: false, errorMessage: parseUpstreamError(lastErrorCode || 502, lastErrorText, ctx) };
}

/**
 * نقطة الدخول الموحدة: الموديل المطلوب (slug) يحدد أي إعداد مزوّد يُستخدم —
 * كل موديل ليه base URL ومفاتيح وبروتوكول خاصة بيه من لوحة الأدمن.
 */
export async function negotiateUpstream(
  apiMessages: ApiMessage[],
  signal: AbortSignal,
  modelId: ModelId = DEFAULT_MODEL,
  options: NegotiateOptions = {}
): Promise<NegotiationResult> {
  return negotiateDynamicProvider(apiMessages, signal, options, normalizeModelId(modelId));
}
