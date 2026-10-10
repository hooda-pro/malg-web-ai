import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  acquireGenerationLease,
  GENERATION_BUSY_MESSAGE,
  getUserFlags,
  checkContinueRate,
  ACCOUNT_CHECK_UNAVAILABLE_MESSAGE,
  type GenerationLease,
} from "@/lib/usageGuard";
import { checkAndMaybeRenewQuota, deductTokens } from "@/lib/quota";
import { getCostMultiplier, hasPaidSubscription, isModelPaid } from "@/lib/subscription";
import { getMemory } from "@/lib/memory";
import { getModelProvider } from "@/lib/provider";
import {
  negotiateUpstream,
  estimateTokens,
  normalizeModelId,
  readUpstreamStream,
  EMPTY_RESPONSE_FALLBACK_MESSAGE,
  type ApiMessage,
} from "@/lib/ai";
import { buildPersonalizationBlock, buildSystemPrompt } from "@/lib/systemPrompt";
import { extractAgentStepsMeta } from "@/lib/agentEvents";
import { findUnclosedFence } from "@/lib/parseContent";
import { API_INLINE_TOTAL_MAX_CHARS, extractAttachmentsMeta, toApiUserContent } from "@/lib/attachments";

export const dynamic = "force-dynamic";
// سقف Hobby = 300 (قيمة أكبر بتكسر الـ Deploy على Hobby). على Pro ارفعها لـ 800.
export const maxDuration = 300;

const CONTINUE_INSTRUCTION =
  "تابع من حيث توقفت بالضبط في ردك السابق. اكمل مباشرة بدون إعادة أو تلخيص أي جزء " +
  "سبق كتابته، وبدون أي مقدمة أو تعليق إضافي — فقط استكمل النص/الكود من آخر نقطة وصلت لها.";

// أقصى عدد جولات تكملة تلقائية داخلية (نفس منطق /api/chat) — كبير عشان
// يملا النافذة، والواجهة بتسلسل التكملات لحد ~ساعة.
const MAX_AUTO_CONTINUES = 10;

// لو الرد السابق اتقطع في نص كتلة كود مفتوحة ( بلا إغلاق)، التكملة العامة
// بتخلي الموديل يعيد الملف من الأول أو يفتح كتلة جديدة مكررة — فبنبعت تعليمات
// تكملة داخل نفس الكتلة: يكمل من أول سطر ناقص ويقفلها، من غير إعادة ولا مقدمات.
const CONTINUE_FENCE_INSTRUCTION =
  "ردك السابق اتقطع في نص كتلة كود مفتوحة (آخر ``` بلا سطر إغلاق). أكمل الكود " +
  "مباشرة من أول سطر ناقص داخل نفس الكتلة المفتوحة — ابدأ من حيث توقفت بالضبط، " +
  "وعند الانتهاء أغلق الكتلة بسطر ``` وحده. ممنوع إعادة كتابة أي سطر سبق، " +
  "وممنوع فتح كتلة كود جديدة، وممنوع أي مقدمة أو شرح قبل التكملة.";

export async function POST(req: NextRequest) {
  const guard: { lease: GenerationLease | null } = { lease: null };
  try {
    const res = await handleContinue(req, guard);
    // أي رد مش stream (رفض/خطأ) معناه إن مفيش رد هيشتغل، فنفك الحجز فورًا.
    // لو stream، الحجز بيتفك جوه الـstream نفسه (قبل إشارة الحفظ مباشرة).
    if (!res.headers.get("Content-Type")?.startsWith("text/event-stream")) await guard.lease?.release();
    return res;
  } catch (e) {
    await guard.lease?.release();
    throw e;
  }
}

async function handleContinue(req: NextRequest, guard: { lease: GenerationLease | null }) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const sessionId = String(body?.sessionId || "");
  const messageId = String(body?.messageId || "");
  const uiLanguage = typeof body?.uiLanguage === "string" ? body.uiLanguage.slice(0, 8) : null;
  const model = normalizeModelId(body?.model);
  const personalization = buildPersonalizationBlock({
    customInstructions: body?.customInstructions,
    nickname: body?.nickname,
  });
  if (!sessionId || !messageId) {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  await ensureSchema();

  const flags = await getUserFlags(user.id);
  if (!flags) {
    return NextResponse.json(
      { error: ACCOUNT_CHECK_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }
  const isAdmin = flags.isAdmin;
  if (flags.isBanned) {
    return NextResponse.json(
      { error: "تم حظر حسابك من إدارة المنصة — مش قادر تبعث رسايل حاليًا." },
      { status: 403 }
    );
  }

  const sessionRows = (await sql`
    SELECT id, ended_at FROM chat_sessions WHERE id = ${sessionId} AND user_id = ${user.id}
  `) as { id: string; ended_at: string | null }[];
  if (sessionRows.length === 0) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }
  if (sessionRows[0].ended_at) {
    return NextResponse.json(
      { error: "المحادثة دي اتقفلت — ابدأ محادثة جديدة.", sessionEnded: true },
      { status: 409 }
    );
  }

  const quotaCheck = await checkAndMaybeRenewQuota(user.id, isAdmin);
  if (quotaCheck.blocked) {
    return NextResponse.json({ error: quotaCheck.message, quotaExhausted: true }, { status: 403 });
  }
  const quotaRemaining = quotaCheck.remaining;

  // موديلات الباقات المدفوعة: محجوبة عن الخطة المجانية (الأدمن والمشتركون فقط)
  if (!isAdmin && (await isModelPaid(model).catch(() => false)) && !(await hasPaidSubscription(user.id).catch(() => false))) {
    return NextResponse.json(
      { error: "الموديل ده متاح لمشتركي باقة Pro فقط — اشترك من حسابك عشان تستخدمه.", subscriptionRequired: true },
      { status: 403 }
    );
  }

  // حدود الاستهلاك والتكلفة: (1) عدد مرات «كمّل» في الدقيقة/الساعة، (2) رد واحد شغال في نفس الوقت لكل مستخدم.
  // الأدمن مستثنى. شوف lib/usageGuard.ts لسبب الحدود دي.
  if (!isAdmin) {
    // /api/chat/continue مش بيضيف رسالة user فـ checkMessageRate مبيعدّوش — عشان كده ليه عدّاد مستقل.
    // من غيره كان ممكن حد يكرر الاستدعاء ورا بعض (واحد في كل مرة، فالـlease لوحده مش كفاية) ويستهلك طلبات الموديل.
    const rate = await checkContinueRate(user.id);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: rate.message, rateLimited: true },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }
    const lease = await acquireGenerationLease(user.id);
    if (!lease) {
      return NextResponse.json({ error: GENERATION_BUSY_MESSAGE, busy: true }, { status: 429 });
    }
    guard.lease = lease;
    // لو المستخدم ضغط «إيقاف» أو قفل الصفحة نفك الحجز فورًا (مفيش سباق: الحجز مربوط بتوكن خاص بالطلب ده).
    req.signal.addEventListener("abort", () => {
      void lease.release();
    });
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
  const userMemory = await getMemory(user.id).catch(() => null);

  // اسم الموديل المعروض للهوية — من إعداد الموديل نفسه
  const costMult = await getCostMultiplier(model).catch(() => 1);
  const continueCfg = await getModelProvider(model).catch(() => null);
  const modelDisplayName = continueCfg?.displayName ?? "Malg-A3";
  const videoNative = continueCfg?.supportsVideo === true;

  const apiMessages: ApiMessage[] = [
    {
      role: "system",
      content:
        buildSystemPrompt({ userName: user.displayName, uiLanguage, modelName: modelDisplayName, memory: userMemory }) +
        (personalization ? `\n\n${personalization}` : ""),
    },
    // نفس تخفيف /api/chat: المرفقات قايمة أسماء (+ ملفات صغيرة inline في آخر رسالة)
    // والصور بس في آخر رسالة فيها صور — بدل ما كل محتوى الـ zip يتبعت تاني.
    ...(() => {
      const win = history.slice(-10);
      let lastUser = -1;
      let lastImage = -1;
      win.forEach((m, i) => {
        if (m.role !== "user") return;
        lastUser = i;
        if (extractAttachmentsMeta(m.content).attachments.some((a) => a.kind === "image" && a.previewUrl) || (a.kind === "video" && (a.frames?.length ?? 0) > 0)) lastImage = i;
      });
      return win.map((m, i) => ({
        role: m.role,
        content:
          m.role === "user"
            ? toApiUserContent(m.content, {
                inlineBudgetChars: i === lastUser ? API_INLINE_TOTAL_MAX_CHARS : 8_000,
                includeImages: i === lastImage,
                videoNative,
              })
            : m.content,
      }));
    })(),
    {
      role: "user",
      // النص المرئي بس (من غير كتلة بيانات خطوات الـAgent المخفية) هو اللي
      // بيتفحص — وإلا سطر الإغلاق الوهمي جوه الـJSON كان هيلخبط الفحص.
      content: (() => {
        try {
          const visible = extractAgentStepsMeta(existing.content ?? "").visibleText;
          return findUnclosedFence(visible) ? CONTINUE_FENCE_INSTRUCTION : CONTINUE_INSTRUCTION;
        } catch {
          return CONTINUE_INSTRUCTION;
        }
      })(),
    },
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
      try {
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

      // قطع الرد في نصه لو رصيد المستخدم خلص (نفس منطق /api/chat)
      let emittedChars = 0;
      const emitCounted: typeof emit = (kind, text) => {
        emittedChars += text.length;
        emit(kind, text);
      };
      const overBudget = () => quotaRemaining !== null && Math.floor(emittedChars / 3) + 10 >= quotaRemaining;

      let result = await readUpstreamStream(upstreamResponse, req.signal, emitCounted, overBudget, negotiated.protocol);
      let quotaCutOff = !!result.stoppedByLimit;
      if (quotaCutOff) {
        emit("content", "\n\n⚠️ رصيد التوكنز بتاعك خلص فوقفت الرد هنا. اشحن رصيدك أو استنى التجديد التلقائي، وبعدها ابعت «كمّل» تاني.");
      }

      // نفس إصلاح /api/chat: لو الموديل رجّع استجابة فاضية (مشكلة معروفة في
      // الموديلات المجانية زي malg-2.1)، نجرب مرة تانية تلقائيًا قبل ما نسيب
      // زرار "أكمل" من غير أي أثر واضح للمستخدم.
      if (!result.content.trim() && !result.stoppedByUser) {
        const retryNegotiated = await negotiateUpstream(apiMessages, controller.signal, model).catch(
          () => null
        );
        if (retryNegotiated?.ok) {
          const retryResult = await readUpstreamStream(retryNegotiated.response, req.signal, emit, undefined, retryNegotiated.protocol);
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

      // تكملة تلقائية داخلية عند الانقطاع بطول المخرجات (نفس منطق /api/chat):
      // المهمة التافهة مينفعش تقف كل شوية على زرار — نكمّل داخليًا لحد 3 جولات
      // والزرار اليدوي يظهر بس لو لسه مقطوعًا بعدها. الرصيد/الإيقاف لهما سلوكهما.
      let autoRounds = 0;
      while (
        result.finishReason === "length" &&
        !result.stoppedByUser &&
        !quotaCutOff &&
        autoRounds < MAX_AUTO_CONTINUES &&
        (result.toolCalls?.length ?? 0) === 0
      ) {
        autoRounds += 1;
        const contNegotiated = await negotiateUpstream(
          [
            ...apiMessages,
            {
              role: "assistant",
              content: result.content || "",
              ...(result.reasoning ? { reasoning_content: result.reasoning } : {}),
            },
            { role: "user", content: CONTINUE_INSTRUCTION },
          ],
          controller.signal,
          model
        ).catch(() => null);
        if (!contNegotiated || !contNegotiated.ok) break;
        const contResult = await readUpstreamStream(
          contNegotiated.response,
          req.signal,
          emitCounted,
          overBudget,
          contNegotiated.protocol
        ).catch(() => null);
        if (!contResult) break;
        if (contResult.stoppedByLimit) {
          quotaCutOff = true;
          emit("content", "\n\n⚠️ رصيد التوكنز بتاعك خلص فوقفت الرد هنا. اشحن رصيدك أو استنى التجديد التلقائي، وبعدها ابعت «كمّل» تاني.");
          result = { ...result, stoppedByLimit: true };
          break;
        }
        result = {
          content: result.content + contResult.content,
          reasoning: contResult.reasoning
            ? result.reasoning
              ? result.reasoning + "\n\n" + contResult.reasoning
              : contResult.reasoning
            : result.reasoning,
          finishReason: contResult.finishReason ?? result.finishReason,
          stoppedByUser: result.stoppedByUser || contResult.stoppedByUser,
          stoppedByLimit: result.stoppedByLimit || contResult.stoppedByLimit,
          toolCalls: contResult.toolCalls?.length ? contResult.toolCalls : [],
        };
      }
      if (autoRounds > 0) {
        console.warn(
          "[MALG auto-continue] route=continue rounds=" + autoRounds + " chars=" + result.content.length + " final=" + (result.finishReason ?? "?")
        );
      }

      let usedFallback = false;
      if (!result.content.trim() && !result.reasoning.trim() && !result.stoppedByUser) {
        usedFallback = true;
        emit("content", EMPTY_RESPONSE_FALLBACK_MESSAGE);
      }

      if (result.content.trim() || result.reasoning.trim() || usedFallback) {
        const cutNote = quotaCutOff
          ? "\n\n⚠️ رصيد التوكنز بتاعك خلص فوقفت الرد هنا. اشحن رصيدك أو استنى التجديد التلقائي، وبعدها ابعت «كمّل» تاني."
          : "";
        const addedContent = (usedFallback ? EMPTY_RESPONSE_FALLBACK_MESSAGE : result.content) + cutNote;
        const mergedContent = existing.content + addedContent;
        const mergedReasoning = existing.reasoning
          ? result.reasoning
            ? existing.reasoning + "\n\n" + result.reasoning
            : existing.reasoning
          : result.reasoning || null;
        const addedTokens = usedFallback ? 0 : Math.max(1, Math.round(estimateTokens(result.content, result.reasoning) * costMult));
        const newTokensUsed = existing.tokens_used + addedTokens;
        const isTruncated = !usedFallback && !result.stoppedByUser && (result.finishReason === "length" || quotaCutOff);

        try {
          await sql`
            UPDATE chat_messages
            SET content = ${mergedContent}, reasoning = ${mergedReasoning},
                tokens_used = ${newTokensUsed}, is_truncated = ${isTruncated}
            WHERE id = ${messageId}
          `;
        } catch (e) {
          console.error("failed to persist continued message", e);
        }
        if (addedTokens > 0) {
          try {
            await deductTokens(user.id, addedTokens, isAdmin);
          } catch (e) {
            console.error("failed to deduct tokens", e);
          }
        }
      }

      if (quotaCutOff) {
        try {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ quota_exhausted: true })}\n\n`));
        } catch {
          // تجاهل
        }
      }

      // مهم: الحفظ في الداتابيز الأول، وبعدين إشارة [MLAG_SAVED] وقفل القناة
      // — يمنع العميل يعمل refresh قبل الحفظ فيختفي الرد.
      // نفك الحجز قبل ما نبلّغ العميل إن الرد اتحفظ، عشان لو بعت الرسالة اللي بعدها فورًا مايترفضش.
      await guard.lease?.release();
      try {
        streamController.enqueue(encoder.encode("data: [MLAG_SAVED]\n\n"));
        streamController.close();
      } catch {
        // العميل قطع الاتصال أو القناة مقفولة بالفعل
      }
      } finally {
        await guard.lease?.release();
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
