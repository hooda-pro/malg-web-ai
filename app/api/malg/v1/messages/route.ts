import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
// سقف Hobby = 300 (قيمة أكبر بتكسر الـ Deploy على Hobby)
export const maxDuration = 300;

/**
 * POST /api/malg/v1/messages — Anthropic Messages API (بروتوكول Claude Code).
 * بيترجم الطلب من صيغة Anthropic لصيغة OpenAI، وبينادي نقطة
 * /chat/completions الداخلية على نفس السيرفر (فالمصادقة والرصيد والـrate
 * limit والأدوات والـstreaming كلهم نفس منطق نقطة الشات المجرّبة)،
 * وبعدين يترجم الرد (أو الـSSE) لصيغة Anthropic.
 * المصادقة: Authorization: Bearer <key> أو x-api-key: <key>.
 * أي خطأ داخلي بيرجع دايمًا JSON بصيغة Anthropic — مش صفحة HTML.
 */

const ERROR_BY_STATUS: Record<number, { type: string; fallback: string }> = {
  400: { type: "invalid_request_error", fallback: "طلب غير صالح" },
  401: { type: "authentication_error", fallback: "مفتاح API مفقود أو غير صالح" },
  402: { type: "invalid_request_error", fallback: "الرصيد مش كفاية" },
  403: { type: "permission_error", fallback: "غير مسموح" },
  404: { type: "invalid_request_error", fallback: "غير موجود" },
  429: { type: "rate_limit_error", fallback: "تجاوزت الحد المسموح — استنى شوية وجرب تاني" },
};

/** رسالة خطأ جاهزة بصيغة Anthropic. */
function errorResponse(status: number, type: string, message: string): NextResponse {
  return NextResponse.json(
    { type: "error", error: { type, message } },
    { status, headers: { "x-request-id": `req_${randomUUID().replace(/-/g, "").slice(0, 24)}` } }
  );
}

/** نص blocks من نوع [{type:"text",text}] — مفيد للـsystem والمحتوى. */
function blocksToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === "object" ? String((b as { text?: unknown }).text ?? "") : ""))
      .join("");
  }
  return "";
}

/** ترجمة طلب Anthropic → طلب OpenAI Chat Completions. */
function translateRequest(body: Record<string, unknown>): { ok: true; openai: Record<string, unknown>; wantStream: boolean } | { ok: false; error: string } {
  const messages: unknown[] = [];
  const sys = body.system;
  if (sys) {
    const s = blocksToText(sys);
    if (s) messages.push({ role: "system", content: s });
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  for (const m of rawMessages) {
    const msg = m as { role?: unknown; content?: unknown };
    if (!msg || (msg.role !== "user" && msg.role !== "assistant")) {
      return { ok: false, error: "كل رسايل Anthropic لازم يكون دورها user أو assistant" };
    }
    const c = msg.content;
    if (typeof c === "string" || c == null) {
      messages.push({ role: msg.role, content: typeof c === "string" ? c : "" });
      continue;
    }
    if (!Array.isArray(c)) return { ok: false, error: "صيغة المحتوى مش مفهومة" };

    const textParts: string[] = [];
    const toolCalls: unknown[] = [];
    const toolResults: unknown[] = [];
    for (const b of c) {
      const block = b as { type?: string; text?: unknown; id?: unknown; name?: unknown; input?: unknown; tool_use_id?: unknown; content?: unknown };
      if (!block || typeof block !== "object") continue;
      if (block.type === "text") {
        textParts.push(String(block.text ?? ""));
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: typeof block.id === "string" && block.id.trim() ? block.id.trim() : `call_${Math.random().toString(36).slice(2)}`,
          type: "function",
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
        });
      } else if (block.type === "tool_result") {
        toolResults.push({
          role: "tool",
          tool_call_id: block.tool_use_id,
          content: blocksToText(block.content),
        });
      }
      // باقي الأنواع زي الصور بنتجاهلها لو مش مدعومة.
    }
    if (textParts.length > 0 || toolCalls.length > 0) {
      const openaiMsg: Record<string, unknown> = { role: msg.role, content: textParts.join("") };
      if (toolCalls.length > 0) openaiMsg.tool_calls = toolCalls;
      messages.push(openaiMsg);
    }
    messages.push(...toolResults);
  }
  if (messages.length === 0) return { ok: false, error: "لازم تبعت messages فيها رسالة واحدة على الأقل" };

  const wantStream = body.stream === true;
  const out: Record<string, unknown> = {
    model: body.model,
    messages,
    max_tokens: typeof body.max_tokens === "number" && body.max_tokens > 0 ? body.max_tokens : 4096,
    stream: wantStream,
  };
  if (typeof body.temperature === "number") out.temperature = body.temperature;
  if (typeof body.top_p === "number") out.top_p = body.top_p;
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length > 0) out.stop = body.stop_sequences;
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    const tools = (body.tools as Array<Record<string, unknown>>).filter((t) => t && t.name);
    if (tools.length > 0) {
      out.tools = tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description ?? "",
          parameters: t.input_schema ?? { type: "object", properties: {} },
        },
      }));
      const tc = body.tool_choice as { type?: string; name?: unknown } | undefined;
      if (tc?.type === "any") out.tool_choice = "required";
      else if (tc?.type === "tool" && tc.name) out.tool_choice = { type: "function", function: { name: tc.name } };
      else out.tool_choice = "auto";
    }
  }
  return { ok: true, openai: out, wantStream };
}

/** ترجمة رد OpenAI الكامل (غير البثّي) → رد Anthropic Message. */
function translateResponse(data: Record<string, unknown>, requestedModel: unknown) {
  const choice = (data.choices as Array<Record<string, unknown>> | undefined)?.[0];
  const message = (choice?.message ?? {}) as { content?: unknown; tool_calls?: Array<Record<string, unknown>> };
  const content: unknown[] = [];
  if (typeof message.content === "string" && message.content) {
    content.push({ type: "text", text: message.content });
  }
  for (const tc of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const fn = (tc.function ?? {}) as { name?: unknown; arguments?: unknown };
    let input: unknown = {};
    try {
      input = typeof fn.arguments === "string" && fn.arguments ? JSON.parse(fn.arguments) : {};
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", id: tc.id ?? `toolu_${randomUUID().replace(/-/g, "").slice(0, 20)}`, name: fn.name, input });
  }
  if (content.length === 0) content.push({ type: "text", text: "" });
  const finish = choice?.finish_reason;
  const stop_reason = finish === "tool_calls" ? "tool_use" : finish === "length" ? "max_tokens" : "end_turn";
  const usage = (data.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  return {
    id: `msg_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
    type: "message",
    role: "assistant",
    model: data.model ?? requestedModel ?? "claude-malg",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: usage.prompt_tokens ?? 0, output_tokens: usage.completion_tokens ?? 0 },
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1) المصادقة — Bearer أو x-api-key
    const authHeader = req.headers.get("authorization") || "";
    const hasBearer = /^Bearer\s+\S+/i.test(authHeader);
    const apiKey = hasBearer ? authHeader : req.headers.get("x-api-key") ? `Bearer ${req.headers.get("x-api-key")}` : "";
    if (!apiKey) {
      return errorResponse(401, "authentication_error", "مفتاح API مفقود — بعت Authorization: Bearer أو x-api-key");
    }

    // 2) الطلب
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return errorResponse(400, "invalid_request_error", "body مش JSON صالح");
    const translated = translateRequest(body);
    if (!translated.ok) return errorResponse(400, "invalid_request_error", translated.error);

    // 3) نداء داخلي لنقطة الشات — نفس السيرفر، بنفس المفتاح
    const urlObj = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") ?? urlObj.protocol.replace(":", "");
    const origin = `${proto}://${urlObj.host}`;

    let upstream: Response;
    try {
      upstream = await fetch(`${origin}/api/malg/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: apiKey },
        body: JSON.stringify({ ...translated.openai, stream: translated.wantStream }),
      });
    } catch (e) {
      console.error("messages loopback fetch failed", e);
      return errorResponse(502, "api_error", `فشل توصيل النقطة الداخلية: ${String((e as Error)?.message ?? e)}`);
    }

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      const meta = ERROR_BY_STATUS[upstream.status] ?? { type: "api_error", fallback: "حصل خطأ غير متوقع — جرب تاني" };
      let message = meta.fallback;
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) message = String(parsed.error);
      } catch {
        // الرد مش JSON — سيب الfallback
      }
      return errorResponse(
        upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502,
        meta.type,
        message
      );
    }

    // 4) الرد غير البثّي
    if (!translated.wantStream) {
      const data = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
      if (!data || !Array.isArray(data.choices)) {
        console.error("messages non-stream response malformed", data);
        return errorResponse(502, "api_error", "رد داخلي مش متوقع — جرب تاني");
      }
      return NextResponse.json(translateResponse(data, body.model), {
        headers: { "x-request-id": `req_${randomUUID().replace(/-/g, "").slice(0, 24)}` },
      });
    }

    // 5) البثّي: تحويل SSE من صيغة OpenAI لصيغة Anthropic
    const encoder = new TextEncoder();
    let convertError: unknown = null;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, payload: unknown) => {
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
          } catch {
            // المدفق ااتقفل مسبقا — تجاهل
          }
        };
        const modelEcho = (body.model as string) ?? "claude-malg";
        let started = false;
        let blockIdx = -1;
        let openBlock: "text" | "tool" | null = null;
        let stop = "end_turn";
        let inputTokens = 0;
        let outputTokens = 0;
        try {
          if (!upstream.body) throw new Error("empty upstream body");
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            for (;;) {
              const nl = buffer.indexOf("\n");
              if (nl < 0) break;
              const line = buffer.slice(0, nl).replace(/\r$/, "");
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const raw = line.slice(5).trim();
              if (!raw || raw === "[DONE]") continue;
              let chunk: Record<string, unknown>;
              try {
                chunk = JSON.parse(raw) as Record<string, unknown>;
              } catch {
                continue;
              }
              if (chunk.usage) {
                const u = chunk.usage as { prompt_tokens?: number; completion_tokens?: number };
                inputTokens = u.prompt_tokens ?? inputTokens;
                outputTokens = u.completion_tokens ?? outputTokens;
              }
              const choice = (chunk.choices as Array<Record<string, unknown>> | undefined)?.[0];
              if (!choice) continue;
              if (!started) {
                started = true;
                send("message_start", {
                  type: "message_start",
                  message: {
                    id: `msg_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
                    type: "message",
                    role: "assistant",
                    model: (chunk.model as string) ?? modelEcho,
                    content: [],
                    stop_reason: null,
                    stop_sequence: null,
                    usage: { input_tokens: inputTokens, output_tokens: 0 },
                  },
                });
              }
              const delta = (choice.delta ?? {}) as {
                content?: string;
                tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
              };
              if (delta.content) {
                if (openBlock !== "text") {
                  if (openBlock) send("content_block_stop", { type: "content_block_stop", index: blockIdx });
                  blockIdx += 1;
                  openBlock = "text";
                  send("content_block_start", { type: "content_block_start", index: blockIdx, content_block: { type: "text", text: "" } });
                }
                send("content_block_delta", { type: "content_block_delta", index: blockIdx, delta: { type: "text_delta", text: delta.content } });
              }
              for (const t of Array.isArray(delta.tool_calls) ? delta.tool_calls : []) {
                if (t.id || t.function?.name) {
                  if (openBlock) send("content_block_stop", { type: "content_block_stop", index: blockIdx });
                  blockIdx += 1;
                  openBlock = "tool";
                  send("content_block_start", {
                    type: "content_block_start",
                    index: blockIdx,
                    content_block: { type: "tool_use", id: t.id ?? `toolu_${randomUUID().replace(/-/g, "").slice(0, 20)}`, name: t.function?.name ?? "", input: {} },
                  });
                }
                const args = t.function?.arguments ?? "";
                if (args) send("content_block_delta", { type: "content_block_delta", index: blockIdx, delta: { type: "input_json_delta", partial_json: args } });
              }
              if (choice.finish_reason) {
                const fr = choice.finish_reason;
                stop = fr === "tool_calls" ? "tool_use" : fr === "length" ? "max_tokens" : "end_turn";
              }
            }
          }
          if (!started) {
            // مفيش أي قطعة رجعت — نبعت رسالة نصية فاضية سليمة
            send("message_start", {
              type: "message_start",
              message: {
                id: `msg_${randomUUID().replace(/-/g, "").slice(0, 24)}`,
                type: "message",
                role: "assistant",
                model: modelEcho,
                content: [],
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 0, output_tokens: 0 },
              },
            });
            blockIdx = 0;
            openBlock = "text";
            send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
          }
        } catch (e) {
          convertError = e;
        }
        if (openBlock) send("content_block_stop", { type: "content_block_stop", index: blockIdx });
        send("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: outputTokens } });
        send("message_stop", { type: "message_stop" });
        if (convertError) console.error("messages stream conversion failed", convertError);
        try {
          controller.close();
        } catch {
          // مقفول مسبقا
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
    });
  } catch (e) {
    // شبكة أمان — أي خطأ داخلي بيرجع JSON بصيغة Anthropic دايمًا
    console.error("messages endpoint failed", e);
    return errorResponse(500, "api_error", `خطأ غير متوقع في نقطة messages: ${String((e as Error)?.message ?? e)}`);
  }
}
