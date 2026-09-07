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
} from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// حد أقصى لعدد الرسائل ولطول كل رسالة في الطلب الواحد — يحمي من استهلاك
// رصيد ضخم بغلطة أو ضغط زائد على المزوّدين المجانيين (malg-2.1 / malg-2.2)
// بطلب برمجي واحد ضخم.
const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 24_000;

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

/**
 * نقطة الـ API العامة للمطورين — بيستخدمها المستخدم في تطبيقاته/كوده الخاص
 * (خارج الموقع) بنفس فكرة OpenAI / OpenRouter. المصادقة بمفتاح API في هيدر
 * Authorization، مش بكوكي جلسة المتصفح. بتدعم وضعين: رد كامل دفعة واحدة
 * (الافتراضي)، أو streaming حقيقي بصيغة OpenAI SSE (`"stream": true`) —
 * ده اللي محتاجينه أدوات زي Cline / OpenCode / Codex CLI عشان تشتغل معاها.
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
    if (!["system", "user", "assistant"].includes(role) || !content.trim()) {
      return NextResponse.json({ error: "شكل الرسائل غير صحيح" }, { status: 400 });
    }
    if (content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        { error: `أقصى طول مسموح للرسالة الواحدة: ${MAX_MESSAGE_LENGTH} حرف` },
        { status: 400 }
      );
    }
    apiMessages.push({ role, content });
  }

  // ملحوظة توافق: بنقرأ body.model لو موجودة بس عشان مانرجعش خطأ لأدوات
  // زي Cline/OpenCode/Codex اللي بتبعت الحقل ده دايمًا — بنتجاهل قيمته تمامًا،
  // لأن الموديل محدد فعليًا من المفتاح نفسه وقت إنشائه.
  const wantsStream = body?.stream === true;

  // 5) استدعِ negotiateUpstream الموجودة بالفعل — من غير أي منطق اتصال جديد،
  // نفس الدالة اللي يستخدمها /api/chat حاليًا (بكل منطق إعادة المحاولة والتراجع بتاعها)
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());

  let negotiated;
  try {
    negotiated = await negotiateUpstream(apiMessages, controller.signal, modelId);
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
        // تمامًا (عطل مؤقت شائع في الموديلات المجانية)، جرب مرة تانية. آمن هنا
        // لأن onDelta لسه ما اتنادتش خالص لو المحتوى فاضي، يعني ماتبعتش أي بايت للعميل.
        if (!result.content.trim() && !result.stoppedByUser) {
          const retryNegotiated = await negotiateUpstream(apiMessages, controller.signal, modelId).catch(
            () => null
          );
          if (retryNegotiated?.ok) {
            const retryResult = await readUpstreamStream(retryNegotiated.response, controller.signal, onDelta);
            result = {
              content: result.content + retryResult.content,
              reasoning: result.reasoning || retryResult.reasoning,
              finishReason: retryResult.finishReason ?? result.finishReason,
              stoppedByUser: retryResult.stoppedByUser,
            };
          }
        }

        const finalContent = result.content.trim();

        if (!finalContent) {
          // من غير خصم أي توكنز على رد ماتكتبش أصلاً
          send({ error: { message: GENERIC_UPSTREAM_ERROR, type: "upstream_error" } });
          try {
            streamController.close();
          } catch {
            // تجاهل
          }
          return;
        }

        const promptText = apiMessages.map((m) => m.content).join("\n");
        const totalTokens = estimateTokens(promptText, finalContent);
        await recordUsage({ keyId: keyRow.id, userId: keyRow.user_id, modelId, totalTokens });

        send({
          ...chunkBase,
          choices: [{ index: 0, delta: {}, finish_reason: result.finishReason === "length" ? "length" : "stop" }],
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

  if (!result.content.trim() && !result.stoppedByUser) {
    const retryNegotiated = await negotiateUpstream(apiMessages, controller.signal, modelId).catch(
      () => null
    );
    if (retryNegotiated?.ok) {
      const retryResult = await readUpstreamStream(retryNegotiated.response, controller.signal, () => {});
      result = {
        content: result.content + retryResult.content,
        reasoning: result.reasoning || retryResult.reasoning,
        finishReason: retryResult.finishReason ?? result.finishReason,
        stoppedByUser: retryResult.stoppedByUser,
      };
    }
  }

  const finalContent = result.content.trim();
  if (!finalContent) {
    return NextResponse.json({ error: GENERIC_UPSTREAM_ERROR }, { status: 502 });
  }

  const promptText = apiMessages.map((m) => m.content).join("\n");
  const promptTokens = estimateTokens(promptText);
  const totalTokens = estimateTokens(promptText, finalContent);
  const completionTokens = Math.max(totalTokens - promptTokens, 0);

  await recordUsage({ keyId: keyRow.id, userId: keyRow.user_id, modelId, totalTokens });

  return NextResponse.json({
    id: completionId,
    object: "chat.completion",
    created: createdAt,
    model: modelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: finalContent },
        finish_reason: result.finishReason === "length" ? "length" : "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
    },
  });
}
