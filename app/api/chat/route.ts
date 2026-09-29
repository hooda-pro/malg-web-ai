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
  type UpstreamToolCall,
} from "@/lib/ai";
import {
  buildPersonalizationBlock,
  buildSystemPrompt,
  REGISTERED_TOKEN_QUOTA,
} from "@/lib/systemPrompt";
import { runDeepSearch } from "@/lib/webSearch";
import { extractProjectFiles } from "@/lib/parseContent";
import {
  buildAgentStepsMetaBlock,
  clipOutput,
  extractAgentStepsMeta,
  filePreview,
  type AgentStep,
  type AgentStepDetail,
} from "@/lib/agentEvents";
import { isSandboxConfigured, runInSandbox } from "@/lib/sandbox";
import { RUN_COMMAND_TOOL, classifyCommandTool, collectSessionProjectFiles } from "@/lib/agentTools";
import { buildApiMessageContent } from "@/lib/attachments";

// لو E2B_API_KEY متظبط، بنبعت أداة run_command الحقيقية للموديل في كل نداء —
// لو مش متظبط، الموديل عمره ما يشوف الأداة دي أصلاً (مفيش استدعاء وهمي ممكن يحصل).
const SANDBOX_ON = isSandboxConfigured();
// أقصى عدد "جولات" استدعاء أدوات جوه رد واحد — حماية من حلقة لا نهائية لو
// الموديل فضل يطلب تنفيذ أوامر من غير ما يوصل لإجابة نهائية.
const MAX_TOOL_ROUNDS = 3;

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
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
  const personalization = buildPersonalizationBlock({
    customInstructions: body?.customInstructions,
    nickname: body?.nickname,
  });

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
  // ملحوظة: Postgres بيرفض تخزين أي نص فيه بايت NUL (\u0000) في عمود text —
  // فبنشيله كحماية إضافية هنا (دفاع في العمق فوق إصلاح lib/attachments.ts و
  // lib/agentEvents.ts) عشان أي مصدر تاني ممكن يسرّب NUL (نص PDF مستخرج،
  // لصق غريب...) ما يكسرش حفظ الرسالة تاني. وبنلف الـ INSERT بـ try/catch
  // عشان لو حصل أي خطأ تاني في الحفظ، نرجّع JSON واضح للعميل بدل ما نسيبه
  // ياخد 500 فاضي ويفضل يفسّره كـ"حصل خطأ" غامض.
  const sanitizeForDb = (s: string) => s.replace(/\u0000/g, "");
  const userMsgId = randomUUID();
  try {
    await sql`
      INSERT INTO chat_messages (id, session_id, role, content)
      VALUES (${userMsgId}, ${sessionId}, 'user', ${sanitizeForDb(userPrompt)})
    `;
  } catch (e) {
    console.error("failed to persist user message", e);
    return NextResponse.json(
      { error: "تعذّر حفظ الرسالة — جرّب تاني" },
      { status: 500 }
    );
  }

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
      sandboxAvailable: SANDBOX_ON,
    }) +
    (personalization ? `\n\n${personalization}` : "") +
    (deepSearch.performed && deepSearch.contextBlock ? `\n\n${deepSearch.contextBlock}` : "");

  const apiMessages: ApiMessage[] = [
    { role: "system", content: systemPromptContent },
    // بنحوّل رسايل المستخدم (فيها احتمال مرفقات صور/ملفات في كتلة meta مخفية)
    // لصيغة الـ content الصح — نص عادي لو مفيش صور، أو مصفوفة (نص + صور
    // حقيقية) لو المستخدم رفع صورة، عشان الموديل يشوفها فعليًا (vision).
    ...existing.slice(-10).map((m) => ({
      role: m.role,
      // رسايل المساعد المخزّنة فيها كتلة بيانات خطوات الـAgent (مخرجات أوامر...) —
      // دي للواجهة بس، مش لازم تتبعت للموديل كنص وتاكل توكنز.
      content: m.role === "user" ? buildApiMessageContent(m.content) : extractAgentStepsMeta(m.content).visibleText,
    })),
  ];

  // 3) اتصل بالموديل (مع منطق إعادة المحاولة/التراجع) قبل ما نبدأ نبعت أي حاجة للعميل
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());

  // لو الـ sandbox متظبط، بنبعت أداة run_command الحقيقية من أول نداء — ده
  // بيحل محل أداة البحث المدمجة بتاعت GLM/OpenRouter نفسها (مش بيلغي بحثنا
  // الحقيقي اللي عملناه فوق بالفعل في runDeepSearch وحطيناه في الـ system
  // prompt) — تنازل بسيط ومقصود مقابل قدرة تنفيذ حقيقية.
  const toolOptions = SANDBOX_ON ? { tools: [RUN_COMMAND_TOOL] } : {};

  let negotiated;
  try {
    negotiated = await negotiateUpstream(apiMessages, controller.signal, model, toolOptions);
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

      // حدث Agent حقيقي واحد بس ممكن يتحدد فعليًا قبل ما نبدأ نبعت أي محتوى:
      // البحث العميق (لو حصل فعلاً) خلص شغله بالكامل قبل هذه اللحظة — فبنبعته
      // كخطوة "مكتملة" من الأول، مش كأداة بتتنفذ لحظيًا (لأنها فعلاً خلصت).
      // أي خطوات تانية (كتابة الملفات) بتتكشف على جهاز العميل من نفس الـ
      // content deltas اللي بتتبعت هنا (lib/parseContent.ts بيعمل ده بالفعل)
      // عشان نتجنب تكرار نفس منطق تحليل الكتل جوه السيرفر والعميل مع بعض.
      if (deepSearch.performed) {
        const agentPayload = {
          agent_event: {
            type: "tool_result",
            tool: "web_search",
            id: "search-1",
            detail: { queries: deepSearch.queries, sources: deepSearch.sources },
          },
        };
        try {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify(agentPayload)}\n\n`));
        } catch {
          // تجاهل
        }
      }

      let result = await readUpstreamStream(upstreamResponse, req.signal, emit);

      // *** الإصلاح الأساسي ***
      // لو الاستجابة رجعت فاضية تمامًا (من غير محتوى ولا طلب أداة) ومكانش
      // المستخدم هو اللي وقف، ده أغلب الوقت عطل مؤقت في الموديل المجاني مش
      // رفض فعلي — نجرب مرة تانية تلقائيًا قبل ما نستسلم.
      if (!result.content.trim() && !result.toolCalls?.length && !result.stoppedByUser) {
        const retryNegotiated = await negotiateUpstream(
          apiMessages,
          controller.signal,
          model,
          toolOptions
        ).catch(() => null);
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
            toolCalls: retryResult.toolCalls,
          };
        }
      }

      // ---------------------------------------------------------------
      // حلقة استدعاء الأدوات الحقيقية (run_command): لو الموديل طلب تنفيذ
      // أمر، بننفذه فعليًا في sandbox حقيقي (lib/sandbox.ts)، نبعت للعميل
      // agent_event لحظي (tool_start ثم tool_result/tool_error)، ونرجّع
      // النتيجة الحقيقية للموديل عشان يكمل ردّه بناءً عليها فعليًا — لحد
      // MAX_TOOL_ROUNDS جولة كحد أقصى، وكل ده بيحصل قبل ما نعتبر الرد خلص.
      // ---------------------------------------------------------------
      const loopMessages: ApiMessage[] = [...apiMessages];
      const contentParts: string[] = [result.content];
      const reasoningParts: string[] = result.reasoning ? [result.reasoning] : [];
      const sandboxSteps: AgentStep[] = [];
      let extraTokens = 0;
      let round = 0;

      while (
        SANDBOX_ON &&
        !result.stoppedByUser &&
        result.toolCalls &&
        result.toolCalls.length > 0 &&
        round < MAX_TOOL_ROUNDS
      ) {
        round += 1;
        const toolCalls: UpstreamToolCall[] = result.toolCalls.slice(0, 3); // أقصى 3 استدعاءات متوازية في نفس الجولة

        loopMessages.push({ role: "assistant", content: result.content || "", tool_calls: toolCalls });

        const draftContent = contentParts.join("\n\n");
        const projectFiles = collectSessionProjectFiles(existing, draftContent);

        for (const call of toolCalls) {
          let command = "";
          try {
            command = String(JSON.parse(call.function.arguments || "{}")?.command || "").trim();
          } catch {
            command = "";
          }
          const toolName = classifyCommandTool(command);

          const sendAgentEvent = (payload: Record<string, unknown>) => {
            try {
              streamController.enqueue(
                encoder.encode(`data: ${JSON.stringify({ agent_event: payload })}\n\n`)
              );
            } catch {
              // تجاهل
            }
          };

          if (!command) {
            const msg = "الموديل بعت أمر فاضي — اتجاهل.";
            sendAgentEvent({ type: "tool_error", tool: toolName, id: call.id, message: msg });
            sandboxSteps.push({ id: call.id, tool: toolName, status: "error", message: msg });
            loopMessages.push({
              role: "tool",
              tool_call_id: call.id,
              name: "run_command",
              content: JSON.stringify({ ok: false, error: msg }),
            });
            continue;
          }

          // الأمر نفسه بيظهر للمستخدم فورًا (قبل ما يخلص) عشان يشوف إيه اللي بيتشغّل.
          sendAgentEvent({
            type: "tool_start",
            tool: toolName,
            id: call.id,
            message: command,
            detail: { command },
          });

          const startedAt = Date.now();
          const run = await runInSandbox(projectFiles, command);
          const detail: AgentStepDetail = {
            command,
            stdout: clipOutput(run.stdout, 4000),
            stderr: clipOutput(run.stderr, 4000),
            exitCode: run.exitCode,
            durationMs: Date.now() - startedAt,
          };
          // نسخة أصغر للتخزين الدائم في الداتابيز (المخرجات الكاملة بتتبعت لايف بس)
          const storedDetail: AgentStepDetail = {
            ...detail,
            stdout: clipOutput(run.stdout, 1500),
            stderr: clipOutput(run.stderr, 1500),
          };

          if (run.error) {
            sendAgentEvent({ type: "tool_error", tool: toolName, id: call.id, message: run.error, detail });
            sandboxSteps.push({ id: call.id, tool: toolName, path: command, status: "error", message: run.error, detail: storedDetail });
          } else if (run.ok) {
            sendAgentEvent({ type: "tool_result", tool: toolName, id: call.id, message: command, detail });
            sandboxSteps.push({ id: call.id, tool: toolName, path: command, status: "done", detail: storedDetail });
          } else {
            const msg = `فشل (exit code ${run.exitCode ?? "?"})`;
            sendAgentEvent({ type: "tool_error", tool: toolName, id: call.id, message: msg, detail });
            sandboxSteps.push({ id: call.id, tool: toolName, path: command, status: "error", message: msg, detail: storedDetail });
          }

          loopMessages.push({
            role: "tool",
            tool_call_id: call.id,
            name: "run_command",
            content: JSON.stringify(
              run.error
                ? { ok: false, error: run.error }
                : {
                    ok: run.ok,
                    exitCode: run.exitCode,
                    stdout: run.stdout,
                    stderr: run.stderr,
                  }
            ),
          });
        }

        const nextNegotiated = await negotiateUpstream(
          loopMessages,
          controller.signal,
          model,
          toolOptions
        ).catch(() => null);

        if (!nextNegotiated || !nextNegotiated.ok) break;

        result = await readUpstreamStream(nextNegotiated.response, req.signal, emit);
        contentParts.push(result.content);
        if (result.reasoning) reasoningParts.push(result.reasoning);
        extraTokens += estimateTokens(result.content, result.reasoning);
      }

      let finalContent = contentParts.join("\n\n").trim();
      const finalReasoning = reasoningParts.join("\n\n").trim() || null;
      let usedFallback = false;

      // لسه فاضية بعد إعادة المحاولة، والمستخدم مش هو اللي وقفها — بدل ما نح��ظ
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
          : estimateTokens(userPrompt, finalContent, finalReasoning ?? "") + extraTokens;
        const assistantId = randomUUID();

        // بناء خطوات الـAgent الحقيقية اللي حصلت في الرد ده (بحث فعلي تم +
        // ملفات اتكتبت فعلاً + أي أوامر sandbox حقيقية اتنفذت)، وإلحاقها
        // كبيانات مخفية في آخر النص المخزّن عشان الـActivity Block يترسم في
        // حالته النهائية لما المحادثة تتفتح تاني — بدون أي خطوة وهمية.
        const agentSteps: AgentStep[] = [];
        if (deepSearch.performed) {
          agentSteps.push({
            id: "search-1",
            tool: "web_search",
            status: "done",
            detail: { queries: deepSearch.queries, sources: deepSearch.sources },
          });
        }
        const writtenFiles = finalContent ? extractProjectFiles(finalContent) : [];
        writtenFiles.forEach((f, i) => {
          agentSteps.push({
            id: `file-${i + 1}-${f.path}`,
            tool: "write_file",
            path: f.path,
            status: "done",
            detail: filePreview(f.content),
          });
        });
        agentSteps.push(...sandboxSteps);
        const storedAssistantContent =
          (finalContent || placeholderIfEmpty) + buildAgentStepsMetaBlock(agentSteps);

        try {
          await sql`
            INSERT INTO chat_messages
              (id, session_id, role, content, reasoning, thinking_duration_ms, is_truncated, tokens_used)
            VALUES (
              ${assistantId}, ${sessionId}, 'assistant',
              ${sanitizeForDb(storedAssistantContent)},
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
