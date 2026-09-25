import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { checkApiBalance, deductApiTokens } from "@/lib/apiQuota";
import { extractBearer, verifyApiKey } from "@/lib/apiKeys";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { negotiateUpstream, estimateTokens, type ApiMessage } from "@/lib/ai";
import { buildSystemPrompt } from "@/lib/systemPrompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * نقطة الـ API العامة — بتتكلم مع mlag AI من كودك مباشرة.
 *
 *   curl https://<your-domain>/api/v1/chat/completions \
 *     -H "Authorization: Bearer mlag_sk_..." \
 *     -H "Content-Type: application/json" \
 *     -d '{"model":"glm-4.7-flash","messages":[{"role":"user","content":"hello"}]}'
 *
 * رصيد الـ API منفصل تمامًا عن رصيد الشات في الواجهة (lib/apiQuota.ts)،
 * والافتراضي صفر — لازم الأدمن يشحن رصيد قبل ما النقطة تشتغل.
 */
export async function POST(req: NextRequest) {
  // 1) حد معدل على الـ IP — يمنع إساءة استخدام المفتاح من عميل واحد
  const rl = checkRateLimit(`api:${getClientIp(req)}`, {
    maxAttempts: 30,
    windowMs: 60_000,
    blockMs: 60_000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { message: "طلبات كثيرة جدًا — استنى شوية وحاول تاني", type: "rate_limit" } },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } }
    );
  }

  // 2) التحقق من المفتاح
  const plainKey = extractBearer(req);
  if (!plainKey) {
    return NextResponse.json(
      {
        error: {
          message: "محتاج مفتاح API — حطه في هيدر Authorization بصيغة Bearer <key>",
          type: "invalid_request_error",
        },
      },
      { status: 401 }
    );
  }

  await ensureSchema();

  const verified = await verifyApiKey(plainKey);
  if (!verified) {
    return NextResponse.json(
      { error: { message: "مفتاح الـ API مش صالح أو ملغى", type: "invalid_api_key" } },
      { status: 401 }
    );
  }

  // 3) التحقق من الرصيد
  const balance = await checkApiBalance(verified.userId);
  if (balance.blocked) {
    return NextResponse.json(
      { error: { message: balance.message, type: "insufficient_quota" } },
      { status: 403 }
    );
  }

  // 4) قراءة الطلب
  const body = (await req.json().catch(() => null)) as {
    model?: string;
    messages?: { role?: string; content?: string }[];
    stream?: boolean;
    temperature?: number;
  } | null;

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) {
    return NextResponse.json(
      { error: { message: "لازم تبعت messages غير فاضية", type: "invalid_request_error" } },
      { status: 400 }
    );
  }

  const model = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : undefined;
  const wantsStream = body?.stream === true;

  const apiMessages: ApiMessage[] = [
    {
      role: "system",
      content: buildSystemPrompt({
        userName: "API Developer",
        totalTokens: null,
        remainingTokens: null,
        uiLanguage: null,
      }),
    },
    ...messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role as string, content: m.content as string })),
  ];

  // 5) كلام الموديل — نفس طبقة التفاوض المستخدمة في الشات
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 290_000);

  try {
    const result = await negotiateUpstream(apiMessages, controller.signal);
    if (!result.ok) {
      return NextResponse.json(
        { error: { message: result.errorMessage, type: "upstream_error" } },
        { status: 502 }
      );
    }

    // 6) الخصم من رصيد الـ API
    const usage = estimateTokens(...messages.map((m) => m.content ?? ""));
    await deductApiTokens(verified.userId, usage);

    // 7) الرد — نفس صيغة OpenAI عشان أي SDK يتعامل معاه مباشرة
    if (wantsStream) {
      const upstream = result.response.body;
      if (!upstream) {
        return NextResponse.json({ error: { message: "رد فاضي من المزوّد" } }, { status: 502 });
      }
      return new Response(upstream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const raw = await result.response.text();
    const content = extractContent(raw);
    if (content === null) {
      return NextResponse.json({ error: { message: "مش قادرين نقرا رد المزوّد" } }, { status: 502 });
    }

    return NextResponse.json({
      id: `chatcmpl_${verified.keyId.slice(0, 12)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model || "glm-4.7-flash",
      choices: [
        { index: 0, message: { role: "assistant", content }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: usage },
    });
  } catch (e) {
    console.error("api chat error", e);
    return NextResponse.json(
      { error: { message: "تعذر الاتصال بمزوّد الموديل" } },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
/** بيجمع محتوى الرد من SSE (نفس الأسموك اللي بيرسله GLM في وضع stream). */
function extractContent(raw: string): string | null {
  let out = "";
  let sawAny = false;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload) as {
        choices?: { delta?: { content?: string } }[];
      };
      const piece = parsed.choices?.[0]?.delta?.content;
      if (piece) {
        out += piece;
        sawAny = true;
      }
    } catch {
      // سطور مش JSON بتتجاهل
    }
  }
  return sawAny ? out : null;
}

/** GET على نفس المسار — بتوصف الـ endpoint للمطوّر. */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/v1/chat/completions",
    method: "POST",
    auth: "Authorization: Bearer <your-api-key>",
    compatible: "OpenAI Chat Completions",
    example: {
      curl: `curl ${process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.com"}/api/v1/chat/completions -H "Authorization: Bearer mlag_sk_..." -H "Content-Type: application/json" -d '{"model":"glm-4.7-flash","messages":[{"role":"user","content":"hello"}]}'`,
      node: `const r = await fetch("/api/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, body: JSON.stringify({ model: "glm-4.7-flash", messages: [{ role: "user", content: "hello" }] }) }); const data = await r.json(); console.log(data.choices[0].message.content);`,
    },
  });
}
