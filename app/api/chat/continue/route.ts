import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser, isUserBanned } from "@/lib/auth";
import { checkAndMaybeRenewQuota, deductTokens } from "@/lib/quota";
import {
  negotiateUpstream,
  estimateTokens,
  normalizeModelId,
  readUpstreamStream,
  EMPTY_RESPONSE_FALLBACK_MESSAGE,
  type ApiMessage,
} from "@/lib/ai";
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

  if (await isUserBanned(user.id)) {
    return NextResponse.json(
      { error: "تم حظر حسابك من إدارة المنصة — مش قادر تبعث رسايل حاليًا." },
      { status: 403 }
    );
  }

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
      const encoder = new TextEncoder();

      const emit = (kind: "content" | "reasoning", text: string) => {
        const payload =
          kind === "content"
            ? { choices: [{ delta: { content: text } }] }
            : { choices: [{ delta: { reasoning_content: text } }] };
        try {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // القناة مقفولة بالفعل — تجاهل
        }
      };

      let result = await readUpstreamStream(upstreamResponse, req.signal, emit);

      // نفس إصلاح /api/chat: لو الموديل رجّع استجابة فاضية (مشكلة معروفة في
      // الموديلات المجانية زي malg-2.1)، نجرب مرة تانية تلقائيًا قبل ما نسيب
      // زرار "أكمل" من غير أي أثر واضح للمستخدم.
      if (!result.content.trim() && !result.stoppedByUser) {
        const retryNegotiated = await negotiateUpstream(apiMessages, controller.signal, model).catch(
          () => null
        );
        if (retryNegotiated?.ok) {
          const retryResult = await readUpstreamStream(retryNegotiated.response, req.signal, emit);
          result = {
            content: result.content + retryResult.content,
            reasoning: retryResult.reasoning
              ? result.reasoning
                ? `${result.reasoning}\n\n${retryResult.reasoning}`
                : retryResult.reasoning
              : result.reasoning,
            finishReason: retryResult.finishReason ?? result.finishReason,
            stoppedByUser: retryResult.stoppedByUser,
          };
        }
      }

      let usedFallback = false;
      if (!result.content.trim() && !result.reasoning.trim() && !result.stoppedByUser) {
        usedFallback = true;
        emit("content", EMPTY_RESPONSE_FALLBACK_MESSAGE);
      }

      if (result.content.trim() || result.reasoning.trim() || usedFallback) {
        const addedContent = usedFallback ? EMPTY_RESPONSE_FALLBACK_MESSAGE : result.content;
        const mergedContent = existing.content + addedContent;
        const mergedReasoning = existing.reasoning
          ? result.reasoning
            ? existing.reasoning + "\n\n" + result.reasoning
            : existing.reasoning
          : result.reasoning || null;
        const addedTokens = usedFallback ? 0 : estimateTokens(result.content, result.reasoning);
        const newTokensUsed = existing.tokens_used + addedTokens;
        const isTruncated = !usedFallback && !result.stoppedByUser && result.finishReason === "length";

        try {
          await sql`
            UPDATE chat_messages
            SET content = ${mergedContent}, reasoning = ${mergedReasoning},
                tokens_used = ${newTokensUsed}, is_truncated = ${isTruncated}
            WHERE id = ${messageId}
          `;
          if (addedTokens > 0) await deductTokens(user.id, addedTokens);
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
