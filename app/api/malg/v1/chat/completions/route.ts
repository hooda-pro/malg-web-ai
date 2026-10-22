import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { checkApiBalance, deductApiTokens } from "@/lib/apiQuota";
import { checkRateLimitShared } from "@/lib/rateLimit";
import {
  negotiateUpstream,
  estimateTokensPrecise,
  readUpstreamStream,
  normalizeModelId,
  DEFAULT_MODEL,
  type ApiMessage,
  type UpstreamToolCall,
} from "@/lib/ai";
import { API_IDENTITY_SYSTEM_PROMPT } from "@/lib/systemPrompt";
import { getCostMultiplier, hasPaidSubscription } from "@/lib/subscription";
import { getUserFlags } from "@/lib/usageGuard";

export const dynamic = "force-dynamic";
// سقف Hobby = 300 (قيمة أكبر بتكسر الـ Deploy على Hobby). على Pro ارفعها لـ 800.
export const maxDuration = 300;

// حد أقصى لعدد الرسائل ولطول كل رسالة في الطلب الواحد — يحمي من استهلاك
// رصيد ضخم بغلطة أو ضغط زائد على المزوّدين المجانيين (malg-2.1 / malg-2.2)
// بطلب برمجي واحد ضخم. الأرقام دي أعلى من نسخة أول إصدار من الـ endpoint عشان
// تستوعب جلسات أدوات برمجة حقيقية (محتوى ملفات كاملة في رسايل tool، ومحادثة
// طويلة فيها رحلات ذهاب وإياب كتير مع استدعاءات أدوات).
const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 100_000;

const GENERIC_MISSING_KEY_MESSAGE = "مفتاح API مفقود أو غير صالح";
const GENERIC_UPSTREAM_ERROR = "حصل خطأ غير متوقع أثناء توليد الرد — جرب تاني.";

// الموديل المخصص لنداءات الخلفية الصغيرة (تصنيف أمان الأوامر وأمثالها).
// لازم يبقى موديل مجاني وسريع — لو التوجيه لاسم مش موجود بيتجاهل بهدوء.
const FAST_BG_MODEL_ID = "malgflash";

/** معرّف الموديل القادم من الطلب — نفس تحويل أسماء قائمة /models حرفيًا:
 * lowercase + المسافات بشرطات + الإبقاء على [a-z0-9._/-] زي معرّفات المزوّد
 * الحقيقية (claude-sonnet-5.5 و zai-org/glm-5.3-flash وغيرها). الفاضي
 * يعني "مش مبعت موديل". */
function sanitizeApiModel(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._\/-]/g, "")
    .slice(0, 80);
}

interface ResolvedApiModel {
  id: string;
  tier: string | null;
}

/**
 * حسم الموديل اللي هيخدم الطلب فعليًا — بنمط المنصات الكبيرة (مفتاح واحد
 * يشتغل مع كل الموديلات):
 * 1) الموديل اللي في الطلب نفسه (body.model) — بـ id الصف، أو باسم المزوّد
 *    الحقيقي (ai_models.model)، أو بنسخة التوافق `claude-{id}` اللي بتظهر
 *    في القايمة لفلاتر اكتشاف Claude Code (بتنقلب على الموديل الأصلي،
 *    وclaude-malg بترجع للخطوات اللي بعدها).
 * 2) مفتاح قديم مربوط بموديل معيّن (مش "all") → نفس سلوك المفاتيح القديمة.
 * 3) الموديل الافتراضي النشط (chat) من قاعدة البيانات، وبعد كده malg-ai.
 */
async function resolveApiModel(
  requestedRaw: string,
  keyModelId: string
): Promise<ResolvedApiModel> {
  const findByIdOrReal = async (name: string) => {
    // أسماء المزوّد الحقيقية فيها شرطة مائلة ونقط (zai-org/glm-5.3-flash) —
    // مش بنمررها على normalizeModelId (ريجكسه بيرفضها ويرجّع الافتراضي)
    return (await sql`
      SELECT id, tier FROM ai_models
      WHERE is_active = TRUE AND (id = ${name} OR lower(model) = ${name})
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1
    `) as { id: string; tier: string | null }[];
  };

  if (requestedRaw) {
    // خريطة الأسماء القديمة القليلة (مفاتيح/تكوينات من نسخ أقدم)
    const legacyRequested =
      requestedRaw === "malg-2" || requestedRaw === "malg-2.1" || requestedRaw === "malg-2.2" || requestedRaw === "malg-a3";
    let rows = await findByIdOrReal(legacyRequested ? DEFAULT_MODEL : requestedRaw);
    if (!rows[0]) {
      // نسخة التوافق claude-{id} — بنقلب على الموديل الأصلي اللي وراها
      const stripped = requestedRaw.startsWith("claude-") ? requestedRaw.slice("claude-".length) : "";
      if (stripped) rows = await findByIdOrReal(stripped);
    }
    if (rows[0]) return { id: rows[0].id, tier: rows[0].tier };
  }
  const boundKey = keyModelId ? normalizeModelId(keyModelId) : "";
  if (boundKey && boundKey !== "all") {
    const rows = (await sql`
      SELECT id, tier FROM ai_models
      WHERE is_active = TRUE AND id = ${boundKey}
      LIMIT 1
    `) as { id: string; tier: string | null }[];
    if (rows[0]) return { id: rows[0].id, tier: rows[0].tier };
  }
  try {
    const rows = (await sql`
      SELECT id, tier FROM ai_models
      WHERE is_active = TRUE AND modality = 'chat'
      ORDER BY is_default DESC, sort_order ASC, created_at ASC
      LIMIT 1
    `) as { id: string; tier: string | null }[];
    if (rows[0]) return { id: rows[0].id, tier: rows[0].tier };
  } catch {
    // الجدول لسه متعملش — نكمل للأساس الآمن
  }
  try {
    const rows = (await sql`
      SELECT id, tier FROM ai_models
      WHERE is_active = TRUE AND id = ${DEFAULT_MODEL}
      LIMIT 1
    `) as { id: string; tier: string | null }[];
    if (rows[0]) return { id: rows[0].id, tier: rows[0].tier };
  } catch {
    // تجاهل
  }
  return { id: DEFAULT_MODEL, tier: null };
}

interface ApiKeyLookupRow {
  id: string;
  user_id: string;
  model_id: string;
  is_active: boolean;
  is_banned: boolean;
}

/** بعد أي رد (streaming أو لأ): خصم التوكنز، تحديث آخر استخدام، تسجيل اللوج. */
async function recordUsage(params: {
  keyId: string;
  userId: string;
  modelId: string;
  totalTokens: number;
}) {
  const { keyId, userId, modelId, totalTokens } = params;
  await deductApiTokens(userId, totalTokens);
  try {
    await sql`
      INSERT INTO api_usage_logs (id, api_key_id, user_id, model_id, tokens_used)
      VALUES (${randomUUID()}, ${keyId}, ${userId}, ${modelId}, ${totalTokens})
    `;
    await sql`UPDATE api_keys SET last_used_at = now() WHERE id = ${keyId}`;
  } catch (e) {
    console.error("failed to log api usage", e);
  }
}

/** finish_reason الصحيح: "tool_calls" لو الموديل طلب استدعاء أداة، غير كده stop/length زي المعتاد. */
function computeFinishReason(toolCalls: UpstreamToolCall[] | undefined, upstreamFinishReason: string | null): string {
  if (toolCalls && toolCalls.length > 0) return "tool_calls";
  return upstreamFinishReason === "length" ? "length" : "stop";
}

/** نص إضافي (JSON الأدوات المطلوبة) بيتضاف لتقدير توكنز الإكمال، عشان ردود
 * function-calling (زي كتابة ملف كامل) تتحسب في الرصيد بعدالة زي أي رد نصي. */
function toolCallsBillableText(toolCalls: UpstreamToolCall[] | undefined): string {
  return toolCalls && toolCalls.length > 0 ? JSON.stringify(toolCalls) : "";
}

/**
 * نقطة الـ API العامة للمطورين — بيستخدمها المستخدم في تطبيقاته/كوده الخاص
 * (خارج الموقع) بنفس فكرة OpenAI / OpenRouter. المصادقة بمفتاح API في هيدر
 * Authorization، مش بكوكي جلسة المتصفح. بتدعم:
 * - وضعين: رد كامل دفعة واحدة (الافتراضي)، أو streaming حقيقي بصيغة OpenAI
 *   SSE (`"stream": true`) — ده اللي محتاجينه أدوات زي Cline/OpenCode/Codex.
 * - function calling حقيقي (`tools` / `tool_choice` في الطلب، و `tool_calls`
 *   في الرد) — من غيره أدوات زي Cline بتقدر تكتب نص بس، مش تعدل ملفات فعليًا
 *   أو تشغل أوامر، لأنها معتمدة كليًا على tool_calls عشان تنفذ أي حاجة.
 */
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  await ensureSchema();

  // 1) مفيش هيدر / تنسيق غلط
  const authHeader = req.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const rawKey = match?.[1]?.trim();
  if (!rawKey) {
    return NextResponse.json({ error: GENERIC_MISSING_KEY_MESSAGE }, { status: 401 });
  }

  // 2) دوّر على المفتاح بالـ hash — مطابقة فورية، من غير ما نخزن المفتاح الخام أبدًا
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyRows = (await sql`
    SELECT k.id, k.user_id, k.model_id, k.is_active, u.is_banned
    FROM api_keys k
    JOIN users u ON u.id = k.user_id
    WHERE k.key_hash = ${keyHash}
  `) as ApiKeyLookupRow[];

  const keyRow = keyRows[0];
  if (!keyRow || !keyRow.is_active) {
    return NextResponse.json({ error: GENERIC_MISSING_KEY_MESSAGE }, { status: 401 });
  }

  // 3) صاحب المفتاح محظور
  if (keyRow.is_banned) {
    return NextResponse.json(
      { error: "تم حظر هذا الحساب من إدارة المنصة — مش قادر يستخدم الـ API حاليًا." },
      { status: 403 }
    );
  }

  // Rate limiting لكل مفتاح — إلزامي: malg-2.1 (OpenRouter) و malg-2.2 (xKiro)
  // شغالين على تير مجاني بسقف يومي مشترك بين كل مستخدمي الموقع (شات + API
  // مع بعض)، فاستخدام برمجي مكثف من غير حد يقدر يضرب السقف المشترك ويأثر
  // على كل المستخدمين التانيين.
  const rate = await checkRateLimitShared(`api-key:${keyRow.id}`, {
    // 240/دقيقة: أدوات الوكيل بتبعت رشقات كثيرة متوازية (تصنيف أمان لكل أمر
    // + الرد الأساسي + مهام خلفية MCP). 120 كانت بتتعدي في الجلسات التقيلة
    // وبعدها قفل 60 ثانية كاملة بوقف نداءات تصنيف الأمان مع الرئيسية —
    // البرنامج يعرض "temporarily unavailable" لحد ما الشاط مدمن. رأس
    // Retry-After بيرشد الأداة للمهلة بدل التخمين.
    maxAttempts: 240,
    windowMs: 60_000,
    blockMs: 60_000,
  });
  if (!rate.allowed) {
    console.error(
      `[MALG chat] 429 rate limited key=${keyRow.id} retryAfter=${rate.retryAfterSeconds ?? 60}s`
    );
    return NextResponse.json(
      { error: "تجاوزت الحد المسموح من الطلبات لهذا المفتاح — استنى شوية وجرب تاني." },
      { status: 429, headers: { "Retry-After": String(Math.max(1, rate.retryAfterSeconds ?? 60)) } }
    );
  }

  // 4) الرصيد خالص
  const balanceCheck = await checkApiBalance(keyRow.user_id);
  if (balanceCheck.blocked) {
    return NextResponse.json({ error: balanceCheck.message }, { status: 402 });
  }

  const body = await req.json().catch(() => null);
  const rawMessages = Array.isArray(body?.messages) ? body.messages : null;
  if (!rawMessages || rawMessages.length === 0) {
    const bodyKeys = body && typeof body === "object" ? Object.keys(body).slice(0, 12).join(",") : typeof body;
    console.error("[MALG api] 400 no messages", `keys=[${bodyKeys}]`);
    return NextResponse.json(
      { error: "لازم تبعت messages فيها رسالة واحدة على الأقل" },
      { status: 400 }
    );
  }

  // الموديل من الطلب نفسه (بنمط المنصات الكبيرة) — المفتاح مجرد هوية للخصم
  // والحماية، مش رابط لموديل محدد.
  const requestedModel = sanitizeApiModel(body?.model);
  let resolved = await resolveApiModel(requestedModel, keyRow.model_id);
  let modelId = resolved.id;

  // مسار الخلفية السريع: نداءات الخلفية الصغيرة من أدوات الوكيل (تصنيف أمان
  // أوامر Bash وتوليد أسماء وما شابه) بتبعت: غير بثي + بدون أدوات + رسايل
  // قليلة + ميزانية توكنز صغيرة. الموديلات اللي بتفكر (reasoning) ممكن
  // تأخدها 15-30 ثانية → الأداة بتقطع النداء عند مهلتها القصيرة وتعرض
  // "temporarily unavailable" مع إن الرد لو خلاص نجح من عندنا (اتأكدنا من
  // لوج حقيقي: done non-stream 16027ms على موديل reasoning). فبنحوّل نداءات
  // دي للموديل السريع المخصص (مجاني) والفواتير على المسار الجديد.
  // ملاحظة: نطاق التوجيه ضيق عن قصد عشان ما يلمس الشغل الحقيقي أصلًا:
  // البثي/الأدوات/
  // الميزانية الكبيرة كلهم خارج المسار ده.
  const numericMaxTokens = Number(body?.max_tokens);
  const isSmallBgCall =
    body?.stream !== true &&
    Number.isFinite(numericMaxTokens) && numericMaxTokens > 0 && numericMaxTokens <= 1000 &&
    rawMessages.length <= 3 &&
    (!Array.isArray(body?.tools) || body.tools.length === 0);
  if (isSmallBgCall && modelId !== FAST_BG_MODEL_ID) {
    const fastResolved = await resolveApiModel(FAST_BG_MODEL_ID, keyRow.model_id).catch(() => null);
    if (fastResolved && fastResolved.tier === "free" && fastResolved.id !== modelId) {
      console.error(`[MALG chat] small-bg fast path: ${modelId} -> ${fastResolved.id}`);
      modelId = fastResolved.id;
      resolved = fastResolved;
    }
  }

  // موديل مدفوع + مالك مش مشترك → 403 — نفس قاعدة إنشاء المفاتيح والشات،
  // بس الفحص بقى وقت الاستخدام لأن المفاتيح بقت عامة بلا ربط موديل.
  if (resolved.tier === "paid") {
    const flags = await getUserFlags(keyRow.user_id).catch(() => null);
    if (!flags?.isAdmin && !(await hasPaidSubscription(keyRow.user_id).catch(() => false))) {
      return NextResponse.json(
        { error: "الموديل ده متاح لمشتركي باقة Pro فقط — اشترك من حسابك عشان تستخدمه.", subscriptionRequired: true },
        { status: 403 }
      );
    }
  }

  const costMult = await getCostMultiplier(modelId).catch(() => 1);

  if (rawMessages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `أقصى عدد رسائل مسموح في الطلب الواحد: ${MAX_MESSAGES}` },
      { status: 400 }
    );
  }

  const apiMessages: ApiMessage[] = [];
  for (const m of rawMessages) {
    const rawRole = typeof m?.role === "string" ? m.role : "";
    // الـSDKات الحديثة بتاع OpenAI بتبعت دور "developer" بدل "system" — بنعامله
    // كـsystem عشان العملاء الجديدة ما تترفضش بـ"شكل الرسائل غير صحيح".
    const role = rawRole === "developer" ? "system" : rawRole;
    // بعض العملاء بيبعت content كمصفوفة أجزاء (الـSDKات متعددة الوسائط) —
    // بنضم أجزاء النص في نص واحد بدل ما نرفض الطلب.
    let content = typeof m?.content === "string" ? m.content : "";
    if (!content && Array.isArray(m?.content)) {
      content = (m.content as Array<{ type?: string; text?: string }>)
        .map((p) => (typeof p?.text === "string" ? p.text : ""))
        .filter(Boolean)
        .join("\n");
    }
    if (!["system", "user", "assistant", "tool"].includes(role)) {
      console.error("[MALG api] 400 bad role", JSON.stringify({ index: apiMessages.length, role: rawRole }));
      return NextResponse.json({ error: "شكل الرسائل غير صحيح" }, { status: 400 });
    }
    // رسايل "tool" (نتيجة تنفيذ أداة من الأداة المستدعية زي Cline) ممكن يكون
    // محتواها فاضي أحيانًا (تنفيذ ناجح من غير نص)، وكذلك رسايل "assistant"
    // اللي طلبت استدعاء أداة من غير أي نص مصاحب — باقي الحالات لازم محتوى فعلي.
    const assistantToolCalls =
      role === "assistant" && Array.isArray(m?.tool_calls) ? (m.tool_calls as UpstreamToolCall[]) : undefined;
    const hasAssistantToolCalls = !!assistantToolCalls && assistantToolCalls.length > 0;
    if (role !== "tool" && !hasAssistantToolCalls && !content.trim()) {
      console.error("[MALG api] 400 empty content", JSON.stringify({ index: apiMessages.length, role: rawRole }));
      return NextResponse.json({ error: "شكل الرسائل غير صحيح" }, { status: 400 });
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `أقصى طول مسموح للرسالة الواحدة: ${MAX_MESSAGE_LENGTH} حرف` },
        { status: 400 }
      );
    }
    const entry: ApiMessage = { role, content };
    if (role === "tool") {
      if (typeof m?.tool_call_id === "string") entry.tool_call_id = m.tool_call_id;
      if (typeof m?.name === "string") entry.name = m.name;
    }
    if (hasAssistantToolCalls) entry.tool_calls = assistantToolCalls;
    apiMessages.push(entry);
  }

  // طلبات الخلفية الصغيرة (تصنيف أمان الأوامر وأمثالها): نطلب أقصر إجابة
  // ممكنة — يقلل التفكير الممتد عند الموديل ويقرّب جواب التصنيف من الشكل
  // اللي الأداة متوقعه (كلمة/حكم قصير) بدل شرح مطوّل بيتضيع مهلتها.
  if (isSmallBgCall && apiMessages.length > 0) {
    for (let i = apiMessages.length - 1; i >= 0; i--) {
      if (apiMessages[i].role === "system") {
        apiMessages[i] = {
          ...apiMessages[i],
          content: `${apiMessages[i].content}\nRespond with the shortest possible answer only — no explanations, no preamble, no reasoning.`,
        };
        break;
      }
    }
  }

  const wantsStream = body?.stream === true;

  // function calling: لو الأداة المستدعية (زي Cline) بعتت تعريفات أدوات في
  // طلبها، بنبعتها زي ما هي للموديل (بدون أي تعديل) عشان يقدر يستدعيها فعليًا
  // بدل ما يكتب وصف نصي بس من غير أي تنفيذ حقيقي.
  const rawTools = Array.isArray(body?.tools) && body.tools.length > 0 ? body.tools : undefined;
  const rawToolChoice = body?.tool_choice;

  // بنحقن رسالة هوية "MALG" بعد آخر رسالة system موجودة أصلاً من المستدعي
  // (زي system prompt بتاع Cline/OpenCode نفسه)، عشان تبقى أقرب حاجة لبداية
  // الرد الفعلي وتقدر تتغلب في حالة تعارض هوية — من غير ما تلمس أو تكرر أي
  // حاجة من تعليمات الأداة المستدعية نفسها.
  let identityInsertAt = 0;
  while (identityInsertAt < apiMessages.length && apiMessages[identityInsertAt].role === "system") {
    identityInsertAt++;
  }
  const messagesForUpstream: ApiMessage[] = [
    ...apiMessages.slice(0, identityInsertAt),
    { role: "system", content: API_IDENTITY_SYSTEM_PROMPT },
    ...apiMessages.slice(identityInsertAt),
  ];

  // 5) استدعِ negotiateUpstream الموجودة بالفعل — من غير أي منطق اتصال جديد،
  // نفس الدالة اللي يستخدمها /api/chat حاليًا (بكل منطق إعادة المحاولة والتراجع
  // بتاعها)، بس دلوقتي بتاخد كمان tools/tool_choice اختياريًا.
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());

  const negotiateOptions = { tools: rawTools, toolChoice: rawToolChoice };

  let negotiated;
  try {
    negotiated = await negotiateUpstream(messagesForUpstream, controller.signal, modelId, negotiateOptions);
  } catch {
    return NextResponse.json({ error: "تم إلغاء الطلب" }, { status: 499 });
  }

  if (!negotiated.ok) {
    // عطل مزوّد عابر (429/5xx/شبكة على كل المفاتيح) — انتظار قصير ثم
    // محاولة واحدة إضافية قبل إرجاع 502 للعميل (مفيش بايت اتبعتت للعميل
    // لحد دلوقتي فالمحاولة آمنة).
    if (controller.signal.aborted) {
      return NextResponse.json({ error: "تم إلغاء الطلب" }, { status: 499 });
    }
    await new Promise((r) => setTimeout(r, 700));
    if (controller.signal.aborted) {
      return NextResponse.json({ error: "تم إلغاء الطلب" }, { status: 499 });
    }
    try {
      const retryNegotiated = await negotiateUpstream(messagesForUpstream, controller.signal, modelId, negotiateOptions);
      if (retryNegotiated.ok) negotiated = retryNegotiated;
    } catch {
      return NextResponse.json({ error: "تم إلغاء الطلب" }, { status: 499 });
    }
  }

  if (!negotiated.ok) {
    return NextResponse.json({ error: negotiated.errorMessage }, { status: 502 });
  }
  const upstreamResponse = negotiated.response;

  const completionId = `chatcmpl-${randomUUID()}`;
  const createdAt = Math.floor(Date.now() / 1000);

  // ————————————————————————————————————————————————————————————
  // وضع الـ streaming: SSE بصيغة OpenAI chat.completion.chunk قياسية —
  // مطلوب عشان أدوات زي Cline اللي مابتشتغلش أصلًا مع رد غير-stream.
  // ————————————————————————————————————————————————————————————
  if (wantsStream) {
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(streamController) {
        const chunkBase = {
          id: completionId,
          object: "chat.completion.chunk",
          created: createdAt,
          model: modelId,
        };

        const send = (obj: unknown) => {
          try {
            streamController.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // القناة مقفولة (العميل قطع الاتصال) — تجاهل
          }
        };

        let announced = false;
        const onDelta = (kind: "content" | "reasoning", text: string) => {
          // ما بنبعتش الـ reasoning/thinking للمطورين في الـ API العامة —
          // بس المحتوى النهائي، عشان يفضل متوافق مع أي parser عادي لصيغة OpenAI.
          if (kind !== "content") return;
          if (!announced) {
            send({ ...chunkBase, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] });
            announced = true;
          }
          send({ ...chunkBase, choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
        };

        let result = await readUpstreamStream(upstreamResponse, controller.signal, onDelta, undefined, negotiated.protocol);

        // نفس منطق إعادة المحاولة الموجود في /api/chat: لو الاستجابة رجعت فاضية
        // تمامًا (مش نص ولا حتى استدعاء أداة — عطل مؤقت شائع في الموديلات
        // المجانية)، جرب مرة تانية. آمن هنا لأن onDelta لسه ما اتنادتش خالص لو
        // المحتوى فاضي، يعني ماتبعتش أي بايت للعميل.
        if (!result.content.trim() && !result.stoppedByUser && (result.toolCalls?.length ?? 0) === 0) {
          const retryNegotiated = await negotiateUpstream(
            messagesForUpstream,
            controller.signal,
            modelId,
            negotiateOptions
          ).catch(() => null);
          if (retryNegotiated?.ok) {
            const retryResult = await readUpstreamStream(retryNegotiated.response, controller.signal, onDelta, undefined, retryNegotiated.protocol);
            result = {
              content: result.content + retryResult.content,
              reasoning: result.reasoning || retryResult.reasoning,
              finishReason: retryResult.finishReason ?? result.finishReason,
              stoppedByUser: retryResult.stoppedByUser,
              toolCalls: retryResult.toolCalls,
            };
          }
        }

        const finalContent = result.content.trim();
        const toolCalls = result.toolCalls ?? [];
        const hasToolCalls = toolCalls.length > 0;

        if (!finalContent && !hasToolCalls) {
          // من غير خصم أي توكنز على رد ماتكتبش أصلاً
          const promptHead = messagesForUpstream.map((m) => m.content).join(" ").slice(0, 160);
          console.error(
            "[MALG api] stream 502 empty content",
            JSON.stringify({
              model: modelId,
              finishReason: result.finishReason,
              reasoningLen: result.reasoning?.length ?? 0,
              promptHead,
            })
          );
          send({ error: { message: GENERIC_UPSTREAM_ERROR, type: "upstream_error" } });
          try {
            streamController.close();
          } catch {
            // تجاهل
          }
          return;
        }

        // لو الموديل طلب استدعاء أداة، بنبعتها كـ delta واحدة كاملة (مش تدريجيًا
        // زي النص العادي) — Cline وأمثالها بتجمّع أي حاجة توصلها بالـ index
        // برضو، فمفيش فرق فعلي في السلوك، وده أبسط وأضمن.
        if (hasToolCalls) {
          send({
            ...chunkBase,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: toolCalls.map((tc, i) => ({
                    index: i,
                    id: tc.id,
                    type: "function",
                    function: tc.function,
                  })),
                },
                finish_reason: null,
              },
            ],
          });
        }

        const billableCompletionText = finalContent + toolCallsBillableText(toolCalls);
        const promptText = messagesForUpstream.map((m) => m.content).join("\n");
        const totalTokens = Math.max(1, Math.round(estimateTokensPrecise(promptText, billableCompletionText) * costMult));
        await recordUsage({ keyId: keyRow.id, userId: keyRow.user_id, modelId, totalTokens });

        send({
          ...chunkBase,
          choices: [{ index: 0, delta: {}, finish_reason: computeFinishReason(toolCalls, result.finishReason) }],
        });
        try {
          streamController.enqueue(encoder.encode("data: [DONE]\n\n"));
          streamController.close();
        } catch {
          // تجاهل
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ————————————————————————————————————————————————————————————
  // الوضع الافتراضي: رد كامل دفعة واحدة (JSON عادي)
  // ————————————————————————————————————————————————————————————
  let result = await readUpstreamStream(upstreamResponse, controller.signal, () => {}, undefined, negotiated.protocol);

  let retriedEmpty = false;
  if (!result.content.trim() && !result.stoppedByUser && (result.toolCalls?.length ?? 0) === 0) {
    const retryNegotiated = await negotiateUpstream(
      messagesForUpstream,
      controller.signal,
      modelId,
      negotiateOptions
    ).catch(() => null);
    if (retryNegotiated?.ok) {
      retriedEmpty = true;
      const retryResult = await readUpstreamStream(retryNegotiated.response, controller.signal, () => {}, undefined, retryNegotiated.protocol);
      result = {
        content: result.content + retryResult.content,
        reasoning: result.reasoning || retryResult.reasoning,
        finishReason: retryResult.finishReason ?? result.finishReason,
        stoppedByUser: retryResult.stoppedByUser,
        toolCalls: retryResult.toolCalls,
      };
    }
  }

  const finalContent = result.content.trim();
  const toolCalls = result.toolCalls ?? [];
  const hasToolCalls = toolCalls.length > 0;

  if (!finalContent && !hasToolCalls) {
    const promptHead = messagesForUpstream.map((m) => m.content).join(" ").slice(0, 160);
    console.error(
      "[MALG api] 502 empty content",
      JSON.stringify({
        model: modelId,
        finishReason: result.finishReason,
        reasoningLen: result.reasoning?.length ?? 0,
        retriedEmpty,
        promptHead,
      })
    );
    return NextResponse.json({ error: GENERIC_UPSTREAM_ERROR }, { status: 502 });
  }

  const billableCompletionText = finalContent + toolCallsBillableText(toolCalls);
  const promptText = messagesForUpstream.map((m) => m.content).join("\n");
  const promptTokens = estimateTokensPrecise(promptText);
  const totalTokens = Math.max(1, Math.round(estimateTokensPrecise(promptText, billableCompletionText) * costMult));
  const completionTokens = Math.max(totalTokens - promptTokens, 0);

  await recordUsage({ keyId: keyRow.id, userId: keyRow.user_id, modelId, totalTokens });

  // تشخيص: زمن الاستجابة الكلي للوضع غير البثي — لو تصنيف الأمان بينتهي
  // مهلته عند العميل، الرقم ده هو الدليل (متوقع يكون كبير لو الموديل بطيء).
  console.error(
    `[MALG chat] done non-stream ${Date.now() - t0}ms model=${modelId} contentLen=${finalContent.length} tools=${hasToolCalls ? toolCalls.length : 0}`
  );

  const message: { role: "assistant"; content: string | null; tool_calls?: UpstreamToolCall[] } = {
    role: "assistant",
    content: finalContent || null,
  };
  if (hasToolCalls) message.tool_calls = toolCalls;

  return NextResponse.json({
    id: completionId,
    object: "chat.completion",
    created: createdAt,
    model: modelId,
    choices: [
      {
        index: 0,
        message,
        finish_reason: computeFinishReason(toolCalls, result.finishReason),
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  });
}
