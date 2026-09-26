import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { checkApiBalance, deductApiTokens } from "@/lib/apiQuota";
import { checkRateLimit } from "@/lib/rateLimit";
import {
  negotiateUpstream,
  estimateTokens,
  readUpstreamStream,
  normalizeModelId,
  type ApiMessage,
  type UpstreamToolCall,
} from "@/lib/ai";
import { API_IDENTITY_SYSTEM_PROMPT } from "@/lib/systemPrompt";

export const dynamic = "force-dynamic";
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
  const rate = checkRateLimit(`api-key:${keyRow.id}`, {
    maxAttempts: 30,
    windowMs: 60_000,
    blockMs: 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "تجاوزت الحد المسموح من الطلبات لهذا المفتاح — استنى شوية وجرب تاني." },
      { status: 429 }
    );
  }

  // 4) الرصيد خالص
  const balanceCheck = await checkApiBalance(keyRow.user_id);
  if (balanceCheck.blocked) {
    return NextResponse.json({ error: balanceCheck.message }, { status: 402 });
  }

  const modelId = normalizeModelId(keyRow.model_id);

  const body = await req.json().catch(() => null);
  const rawMessages = Array.isArray(body?.messages) ? body.messages : null;
  if (!rawMessages || rawMessages.length === 0) {
    return NextResponse.json(
      { error: "لازم تبعت messages فيها رسالة واحدة على الأقل" },
      { status: 400 }
    );
  }
  if (rawMessages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `أقصى عدد رسائل مسموح في الطلب الواحد: ${MAX_MESSAGES}` },
      { status: 400 }
    );
  }

  const apiMessages: ApiMessage[] = [];
  for (const m of rawMessages) {
    const role = typeof m?.role === "string" ? m.role : "";
    const content = typeof m?.content === "string" ? m.content : "";
    if (!["system", "user", "assistant", "tool"].includes(role)) {
      return NextResponse.json({ error: "شكل الرسائل غير صحيح" }, { status: 400 });
    }
    // رسايل "tool" (نتيجة تنفيذ أداة من الأداة المستدعية زي Cline) ممكن يكون
    // محتواها فاضي أحيانًا (تنفيذ ناجح من غير نص)، وكذلك رسايل "assistant"
    // اللي طلبت استدعاء أداة من غير أي نص مصاحب — باقي الحالات لازم محتوى فعلي.
    const assistantToolCalls =
      role === "assistant" && Array.isArray(m?.tool_calls) ? (m.tool_calls as UpstreamToolCall[]) : undefined;
    const hasAssistantToolCalls = !!assistantToolCalls && assistantToolCalls.length > 0;
    if (role !== "tool" && !hasAssistantToolCalls && !content.trim()) {
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

  const wantsStream = body?.stream === true;

  // function calling: لو الأداة المستدعية (زي Cline) بعتت تعريفات أدوات في
  // طلبها، بنبعتها زي ما هي للموديل (بدون أي تعديل) عشان يقدر يستدعيها فعليًا
  // بدل ما يكتب وصف نصي بس من غير أي تنفيذ حقيقي.
  const rawTools = Array.isArray(body?.tools) && body.tools.length > 0 ? body.tools : undefined;
  const rawToolChoice = body?.tool_choice;

  // بنحقن رسالة هوية "mlag" بعد آخر رسالة system موجودة أصلاً من المستدعي
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

        let result = await readUpstreamStream(upstreamResponse, controller.signal, onDelta);

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
            const retryResult = await readUpstreamStream(retryNegotiated.response, controller.signal, onDelta);
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
        const totalTokens = estimateTokens(promptText, billableCompletionText);
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
  let result = await readUpstreamStream(upstreamResponse, controller.signal, () => {});

  if (!result.content.trim() && !result.stoppedByUser && (result.toolCalls?.length ?? 0) === 0) {
    const retryNegotiated = await negotiateUpstream(
      messagesForUpstream,
      controller.signal,
      modelId,
      negotiateOptions
    ).catch(() => null);
    if (retryNegotiated?.ok) {
      const retryResult = await readUpstreamStream(retryNegotiated.response, controller.signal, () => {});
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
    return NextResponse.json({ error: GENERIC_UPSTREAM_ERROR }, { status: 502 });
  }

  const billableCompletionText = finalContent + toolCallsBillableText(toolCalls);
  const promptText = messagesForUpstream.map((m) => m.content).join("\n");
  const promptTokens = estimateTokens(promptText);
  const totalTokens = estimateTokens(promptText, billableCompletionText);
  const completionTokens = Math.max(totalTokens - promptTokens, 0);

  await recordUsage({ keyId: keyRow.id, userId: keyRow.user_id, modelId, totalTokens });

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
