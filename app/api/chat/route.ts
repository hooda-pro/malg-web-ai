import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { checkAndMaybeRenewQuota, deductTokens } from "@/lib/quota";
import { negotiateUpstream, estimateTokens, type ApiMessage } from "@/lib/ai";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "يجب تسجيل الدخول أو إنشاء حساب لإرسال الرسائل" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId || "");
  const userPrompt = String(body?.message || "").trim();

  if (!sessionId || !userPrompt) {
    return NextResponse.json({ error: "الرسالة فارغة" }, { status: 400 });
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

  // 1) احفظ رسالة المستخدم
  const userMsgId = randomUUID();
  await sql`
    INSERT INTO chat_messages (id, session_id, role, content)
    VALUES (${userMsgId}, ${sessionId}, 'user', ${userPrompt})
  `;

  const existing = (await sql`
    SELECT role, content FROM chat_messages WHERE session_id = ${sessionId} ORDER BY created_at ASC
  `) as { role: string; content: string }[];

  if (existing.length <= 1) {
    const preview = userPrompt.length > 30 ? userPrompt.slice(0, 30) + "..." : userPrompt;
    await sql`UPDATE chat_sessions SET title = ${preview}, updated_at = now() WHERE id = ${sessionId}`;
  } else {
    await sql`UPDATE chat_sessions SET updated_at = now() WHERE id = ${sessionId}`;
  }

  // 2) جهّز الرسائل المرسلة للموديل: system prompt + آخر 10 رسائل
  const apiMessages: ApiMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...existing.slice(-10).map((m) => ({ role: m.role, content: m.content })),
  ];

  // 3) اتصل بالموديل (مع منطق إعادة المحاولة/التراجع) قبل ما نبدأ نبعت أي حاجة للعميل
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());

  let negotiated;
  try {
    negotiated = await negotiateUpstream(apiMessages, controller.signal);
  } catch {
    return NextResponse.json({ error: "تم إلغاء الطلب" }, { status: 499 });
  }

  if (!negotiated.ok) {
    return NextResponse.json({ error: negotiated.errorMessage }, { status: 502 });
  }

  const upstreamResponse = negotiated.response;
  const streamStart = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const reader = upstreamResponse.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      let buffer = "";
      let accumulatedContent = "";
      let accumulatedReasoning = "";
      let finishReason: string | null = null;
      let contentStartTime: number | null = null;
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
          if (delta?.reasoning_content) {
            accumulatedReasoning += delta.reasoning_content;
          }
          if (delta?.content) {
            if (contentStartTime === null) contentStartTime = Date.now();
            accumulatedContent += delta.content;
          }
        } catch {
          // سطر غير صالح كـ JSON — تجاهله
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
        // انقطاع أثناء القراءة — لو المستخدم هو اللي وقف، هنحفظ اللي وصلنا لحد دلوقتي
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        try {
          streamController.close();
        } catch {
          // القناة مقفولة بالفعل
        }

        const finalContent = accumulatedContent.trim();
        const finalReasoning = accumulatedReasoning.trim() || null;
        const thinkingDurationMs = finalReasoning
          ? (contentStartTime ?? Date.now()) - streamStart
          : null;

        if (finalContent || finalReasoning || stoppedByUser) {
          const totalTokens = estimateTokens(userPrompt, finalContent, finalReasoning ?? "");
          const assistantId = randomUUID();
          try {
            await sql`
              INSERT INTO chat_messages
                (id, session_id, role, content, reasoning, thinking_duration_ms, is_truncated, tokens_used)
              VALUES (
                ${assistantId}, ${sessionId}, 'assistant',
                ${finalContent || "تمت معالجة السؤال بنجاح."},
                ${finalReasoning}, ${thinkingDurationMs},
                ${!stoppedByUser && finishReason === "length"},
                ${totalTokens}
              )
            `;
            await deductTokens(user.id, totalTokens);
          } catch (e) {
            console.error("failed to persist assistant message", e);
          }
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
