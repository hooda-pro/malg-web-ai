import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { checkAndMaybeRenewQuota, deductTokens } from "@/lib/quota";
import { negotiateUpstream, estimateTokens, normalizeModelId, type ApiMessage } from "@/lib/ai";
import { buildSystemPrompt } from "@/lib/systemPrompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONTINUE_INSTRUCTION =
  "تابع من حيث توقفت بالضبط في ردك السابق. اكمل مباشرة بدون إعادة أو تلخيص أي جزء " +
  "سبق كتابته، وبدون أي مقدمة أو تعليق إضافي — فقط استكمل النص/الكود من آخر نقطة وصلت لها.";

export async function POST(req: NextRequest) {
  const user = getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId || "");
  const messageId = String(body?.messageId || "");
  const uiLanguage = typeof body?.uiLanguage === "string" ? body.uiLanguage.slice(0, 8) : null;
  const model = normalizeModelId(body?.model);
  if (!sessionId || !messageId) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  await ensureSchema();

  const sessionRows = await sql`
    SELECT id FROM chat_sessions WHERE id = ${sessionId} AND user_id = ${user.id}
  `;
  if (sessionRows.length === 0) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  const quotaCheck = await checkAndMaybeRenewQuota(user.id, user.isAdmin);
  if (quotaCheck.blocked) {
    return NextResponse.json({ error: quotaCheck.message }, { status: 403 });
  }

  const existingRows = (await sql`
    SELECT id, content, reasoning, tokens_used FROM chat_messages
    WHERE id = ${messageId} AND session_id = ${sessionId}
  `) as { id: string; content: string; reasoning: string | null; tokens_used: number }[];
  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: "الرسالة غير موجودة" }, { status: 404 });
  }

  const history = (await sql`
    SELECT role, content FROM chat_messages WHERE session_id = ${sessionId} ORDER BY created_at ASC
  `) as { role: string; content: string }[];

  const apiMessages: ApiMessage[] = [
    { role: "system", content: buildSystemPrompt({ userName: user.displayName, uiLanguage }) },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: CONTINUE_INSTRUCTION },
  ];

  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());

  let negotiated;
  try {
    negotiated = await negotiateUpstream(apiMessages, controller.signal, model);
  } catch {
    return NextResponse.json({ error: "تم إلغاء الطلب" }, { status: 499 });
  }

  if (!negotiated.ok) {
    return NextResponse.json({ error: negotiated.errorMessage }, { status: 502 });
  }

  const upstreamResponse = negotiated.response;

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const reader = upstreamResponse.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      let buffer = "";
      let accumulatedContent = "";
      let accumulatedReasoning = "";
      let finishReason: string | null = null;
      let stoppedByUser = false;

      const onAbort = () => {
        stoppedByUser = true;
        try {
          reader.cancel();
        } catch {
          // تجاهل
        }
      };
      req.signal.addEventListener("abort", onAbort);

      const processLine = (rawLine: string) => {
        const line = rawLine.trim();
        if (!line || line.startsWith(":")) return;
        if (!line.startsWith("data:")) return;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const choice = json?.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          const delta = choice?.delta;
          if (delta?.reasoning_content) accumulatedReasoning += delta.reasoning_content;
          if (delta?.content) accumulatedContent += delta.content;
        } catch {
          // تجاهل سطر غير صالح
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          streamController.enqueue(encoder.encode(chunk));

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) processLine(line);
        }
      } catch {
        // تم الإيقاف من المستخدم أو خطأ اتصال
      } finally {
        req.signal.removeEventListener("abort", onAbort);

        if (accumulatedContent || accumulatedReasoning) {
          const mergedContent = existing.content + accumulatedContent;
          const mergedReasoning = existing.reasoning
            ? accumulatedReasoning
              ? existing.reasoning + "\n\n" + accumulatedReasoning
              : existing.reasoning
            : accumulatedReasoning || null;
          const addedTokens = estimateTokens(accumulatedContent, accumulatedReasoning);
          const newTokensUsed = existing.tokens_used + addedTokens;
          const isTruncated = !stoppedByUser && finishReason === "length";

          try {
            await sql`
              UPDATE chat_messages
              SET content = ${mergedContent}, reasoning = ${mergedReasoning},
                  tokens_used = ${newTokensUsed}, is_truncated = ${isTruncated}
              WHERE id = ${messageId}
            `;
            await deductTokens(user.id, addedTokens);
          } catch (e) {
            console.error("failed to persist continued message", e);
          }
        }

        // مهم: الحفظ في الداتابيز الأول، وبعدين إشارة [MLAG_SAVED] وقفل القناة
        // — يمنع العميل يعمل refresh قبل الحفظ فيختفي الرد.
        try {
          streamController.enqueue(encoder.encode("data: [MLAG_SAVED]\n\n"));
          streamController.close();
        } catch {
          // العميل قطع الاتصال أو القناة مقفولة بالفعل
        }
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
