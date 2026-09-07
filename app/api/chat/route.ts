import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
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
import { buildSystemPrompt, REGISTERED_TOKEN_QUOTA } from "@/lib/systemPrompt";
import { runDeepSearch } from "@/lib/webSearch";

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
  const uiLanguage = typeof body?.uiLanguage === "string" ? body.uiLanguage.slice(0, 8) : null;
  const model = normalizeModelId(body?.model);

  if (!sessionId || !userPrompt) {
    return NextResponse.json({ error: "الرسالة فارغة" }, { status: 400 });
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

  // 2) جهّز الرسائل المرسلة للموديل: system prompt ديناميكي (اسم اليوزر + الرصيد + معرفة المنصة) + آخر 10 رسائل
  const quotaRows = (await sql`
    SELECT total_allocated_tokens, used_tokens FROM user_quota WHERE user_id = ${user.id}
  `) as { total_allocated_tokens: number; used_tokens: number }[];
  const totalAllocated = Number(quotaRows[0]?.total_allocated_tokens ?? REGISTERED_TOKEN_QUOTA);
  const usedTokensCount = Number(quotaRows[0]?.used_tokens ?? 0);

  // 2.5) بحث عميق حقيقي (مش مجرد تعليمة للموديل) — لو الرسالة محتاجة معلومة
  // حديثة/متغيرة وفيه مفتاح بحث متظبط، بنعمل أكتر من استعلام حقيقي بالتوازي
  // ونحط النتايج جوه الـ system prompt قبل ما نكلم الموديل. ده بيدي فعليًا
  // قدرة بحث لموديل malg-2.2 اللي مالوش أي أداة بحث من عنده أصلًا، وبيعمق
  // البحث لباقي الموديلات بدل ما نسيب القرار كله لأداة البحث المدمجة عندهم
  // (صندوق أسود مش متحكمين فيه).
  const deepSearch = await runDeepSearch(userPrompt);

  const systemPromptContent =
    buildSystemPrompt({
      userName: user.displayName,
      totalTokens: totalAllocated,
      remainingTokens: Math.max(totalAllocated - usedTokensCount, 0),
      uiLanguage,
    }) + (deepSearch.performed && deepSearch.contextBlock ? `\n\n${deepSearch.contextBlock}` : "");

  const apiMessages: ApiMessage[] = [
    { role: "system", content: systemPromptContent },
    ...existing.slice(-10).map((m) => ({ role: m.role, content: m.content })),
  ];

  // 3) اتصل بالموديل (مع منطق إعادة المحاولة/التراجع) قبل ما نبدأ نبعت أي حاجة للعميل
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
  const streamStart = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const encoder = new TextEncoder();
      let contentStartTime: number | null = null;

      // بنبعت للعميل نسخة موحّدة من الـ delta (بدل الـ passthrough الخام)
      // عشان نقدر نتحكم في التوقيت ونعمل إعادة محاولة شفافة لو الاستجابة رجعت فاضية،
      // من غير ما نغيّر أي حاجة في شكل البيانات اللي lib/streamClient.ts بيستهلكها.
      const emit = (kind: "content" | "reasoning", text: string) => {
        if (kind === "content" && contentStartTime === null) contentStartTime = Date.now();
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

      // *** الإصلاح الأساسي ***
      // لو الاستجابة رجعت فاضية تمامًا (من غير محتوى) ومكانش المستخدم هو اللي وقف،
      // ده أغلب الوقت عطل مؤقت في الموديل المجاني (زي malg-2.1) مش رفض فعلي —
      // نجرب مرة تانية تلقائيًا قبل ما نستسلم، بدل ما نسيب المستخدم من غير رد ولا تفسير.
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

      let finalContent = result.content.trim();
      const finalReasoning = result.reasoning.trim() || null;
      let usedFallback = false;

      // لسه فاضية بعد إعادة المحاولة، والمستخدم مش هو اللي وقفها — بدل ما نحفظ
      // رسالة كذب زي "تمت المعالجة بنجاح"، نبعت للمستخدم رسالة صادقة توضح إن
      // في مشكلة مؤقتة في المزوّد، ومنخصمش عليه توكنز على رد ماتكتبش أصلاً.
      if (!finalContent && !result.stoppedByUser) {
        usedFallback = true;
        emit("content", EMPTY_RESPONSE_FALLBACK_MESSAGE);
        finalContent = EMPTY_RESPONSE_FALLBACK_MESSAGE;
      }

      const thinkingDurationMs = finalReasoning
        ? (contentStartTime ?? Date.now()) - streamStart
        : null;

      // حالة إيقاف المستخدم من غير أي محتوى ولا تفكير — نسجّلها بوضوح إنها إيقاف
      // متعمد، مش "نجاح"، عشان ما نضللش أي مراجعة لاحقة للمحادثة.
      const placeholderIfEmpty = result.stoppedByUser ? "تم إيقاف الرد بواسطتك." : "";

      if (finalContent || finalReasoning || result.stoppedByUser) {
        const totalTokens = usedFallback
          ? 0
          : estimateTokens(userPrompt, finalContent, finalReasoning ?? "");
        const assistantId = randomUUID();
        try {
          await sql`
            INSERT INTO chat_messages
              (id, session_id, role, content, reasoning, thinking_duration_ms, is_truncated, tokens_used)
            VALUES (
              ${assistantId}, ${sessionId}, 'assistant',
              ${finalContent || placeholderIfEmpty},
              ${finalReasoning}, ${thinkingDurationMs},
              ${!usedFallback && !result.stoppedByUser && result.finishReason === "length"},
              ${totalTokens}
            )
          `;
          if (totalTokens > 0) await deductTokens(user.id, totalTokens);
        } catch (e) {
          console.error("failed to persist assistant message", e);
        }
      }

      // مهم جداً: نحفظ في الداتابيز الأول (فوق)، وبعدين نرسل إشارة [MLAG_SAVED]
      // وبعد كده نقفل القناة. لو قفلنا القناة قبل الحفظ، العميل يعمل refresh
      // ويلاقي الرسايل لسه متسجلتش — فيختفي الرد من الواجهة رغم إنه اتحفظ بعدها.
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
