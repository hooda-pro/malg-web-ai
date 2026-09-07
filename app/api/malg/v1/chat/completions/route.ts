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

/**
 * نقطة الـ API العامة للمطورين — بيستخدمها المستخدم في تطبيقاته/كوده الخاص
 * (خارج الموقع) بنفس فكرة OpenAI / OpenRouter. المصادقة بمفتاح API في هيدر
 * Authorization، مش بكوكي جلسة المتصفح.
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

  let result = await readUpstreamStream(negotiated.response, controller.signal, () => {});

  // نفس منطق إعادة المحاولة الموجود في /api/chat: لو الاستجابة رجعت فاضية
  // تمامًا (عطل مؤقت شائع في الموديلات المجانية)، جرب مرة تانية قبل ما نرجّع خطأ.
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

  // بعد الرد: تقدير التوكنز، خصمها من رصيد الـ API، تحديث آخر استخدام، وتسجيل اللوج
  const promptText = apiMessages.map((m) => m.content).join("\n");
  const promptTokens = estimateTokens(promptText);
  const totalTokens = estimateTokens(promptText, finalContent);
  const completionTokens = Math.max(totalTokens - promptTokens, 0);

  await deductApiTokens(keyRow.user_id, totalTokens);

  const usageId = randomUUID();
  try {
    await sql`
      INSERT INTO api_usage_logs (id, api_key_id, user_id, model_id, tokens_used)
      VALUES (${usageId}, ${keyRow.id}, ${keyRow.user_id}, ${modelId}, ${totalTokens})
    `;
    await sql`UPDATE api_keys SET last_used_at = now() WHERE id = ${keyRow.id}`;
  } catch (e) {
    console.error("failed to log api usage", e);
  }

  return NextResponse.json({
    id: `chatcmpl-${usageId}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
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
