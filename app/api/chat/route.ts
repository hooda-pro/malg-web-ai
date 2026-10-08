import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import {
  acquireGenerationLease,
  checkMessageRate,
  GENERATION_BUSY_MESSAGE,
  getUserFlags,
  ACCOUNT_CHECK_UNAVAILABLE_MESSAGE,
  type GenerationLease,
} from "@/lib/usageGuard";
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
import { isDeepSearchEnabled, runDeepSearch, runToolSearch } from "@/lib/webSearch";
import { extractProjectFiles } from "@/lib/parseContent";
import {
  buildAgentStepsMetaBlock,
  clipOutput,
  extractAgentStepsMeta,
  filePreview,
  type AgentStep,
  type AgentStepDetail,
} from "@/lib/agentEvents";
import { createHash } from "crypto";
import { getSandboxMemoryMb, isSandboxConfigured, SESSION_BUDGET_MS, SandboxSession } from "@/lib/sandbox";
import {
  LIST_FILES_TOOL,
  READ_FILE_TOOL,
  RUN_COMMAND_TOOL,
  WEB_SEARCH_TOOL,
  classifyCommandTool,
  collectSessionProjectFiles,
  isProjectTool,
  runProjectTool,
} from "@/lib/agentTools";
import {
  ASK_CLOSE_CONFIRMATION_TOOL,
  DEFAULT_END_MESSAGE,
  DEFAULT_END_MESSAGE_USER,
  END_CONVERSATION_TOOL,
  MIN_WARNINGS_BEFORE_END,
  WARN_USER_TOOL,
  cleanReason,
  isModerationTool,
} from "@/lib/conversationEnd";
import {
  API_INLINE_TOTAL_MAX_CHARS,
  apiUserContentLength,
  extractAttachmentsMeta,
  extractAttachmentsPromptSection,
  toApiUserContent,
} from "@/lib/attachments";

// لو E2B_API_KEY متظبط، بنبعت أداة run_command الحقيقية للموديل في كل نداء —
// لو مش متظبط، الموديل عمره ما يشوف الأداة دي أصلاً (مفيش استدعاء وهمي ممكن يحصل).
const SANDBOX_ON = isSandboxConfigured();
// أقصى عدد "جولات" استدعاء أدوات جوه رد واحد — حماية من حلقة لا نهائية لو
// الموديل فضل يطلب أدوات من غير ما يوصل لإجابة نهائية. كان 3 وده كان بيخلّي
// الرد يفصل في النص (قراءة ملفين + أمر = خلصت الجولات). لو الجولات خلصت،
// بنعمل نداء أخير من غير أدوات عشان الموديل يكتب خلاصة (شوف تحت).
const MAX_TOOL_ROUNDS = 8;

/** بتتضاف لآخر الرد لو رصيد التوكنز خلص وانت لسه بتكتب. */
const QUOTA_CUTOFF_NOTE =
  "\n\n⚠️ رصيد التوكنز بتاعك خلص فوقفت الرد هنا. اشحن رصيدك أو استنى التجديد التلقائي، وبعدها ابعت «كمّل» وأكمل من نفس النقطة.";
// أقصى عدد استدعاءات أدوات في الجولة الواحدة.
const MAX_CALLS_PER_ROUND = 6;
// تقدير ثابت لتكلفة الصورة الواحدة في الحسبة (بدل ما نعد بايتات Base64).
const IMAGE_TOKEN_ESTIMATE = 800;
// ميزانية الملفات الصغيرة اللي بتتحط inline في الرسايل الأقدم (الأحدث بياخد الميزانية الكاملة).
const OLDER_INLINE_BUDGET_CHARS = 8_000;

// --- الميزانية الزمنية للرد الواحد (maxDuration = 300 ثانية، والعدّ من لحظة وصول الطلب) ---
// قبل كده مفيش أي حد زمني على مستوى الطلب كله: كل نداء موديل + كل أمر كانوا بيتجمعوا لحد ما المنصة
// تقتل الدالة عند 300 ثانية، وبما إن الرد بيتحفظ في الآخر خالص، النتيجة كانت: الرد يقطع ومفيش
// حاجة تتحفظ. دلوقتي:
//  - بعد NO_NEW_ROUND_AFTER_MS منبدأش جولة أدوات جديدة، ونروح على نداء الخلاصة النهائي.
//  - بعد HARD_STOP_MS بنقفل قراءة الموديل ونحفظ اللي وصل (ومعاه زرار «كمّل»).
const NO_NEW_ROUND_AFTER_MS = SESSION_BUDGET_MS + 5_000;
const HARD_STOP_MS = 275_000;
// لو الأوامر فشلت كده ورا بعض، بنسحب أداة run_command ونطلب من الموديل يكتب الملفات ويلخّص بصراحة.
const MAX_CONSECUTIVE_COMMAND_FAILURES = 3;
// نبض كل 10 ثواني عشان أي بروكسي/شبكة موبايل ماتقفلش الاتصال أثناء أمر طويل (npm install...).
const KEEPALIVE_INTERVAL_MS = 10_000;

/** بتتضاف لآخر الرد لو وصلنا للحد الزمني وانت لسه بتكتب. */
const TIME_CUTOFF_NOTE =
  "\n\n⏱️ وصلت للحد الزمني للرد الواحد فوقفت هنا وحفظت اللي اتعمل. ابعت «كمّل» وأكمل من نفس النقطة.";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const guard: { lease: GenerationLease | null } = { lease: null };
  try {
    const res = await handleChat(req, guard);
    // أي رد مش stream (رفض/خطأ) معناه إن مفيش رد هيشتغل، فنفك الحجز فورًا.
    // لو stream، الحجز بيتفك جوه الـstream نفسه (قبل إشارة الحفظ مباشرة).
    if (!res.headers.get("Content-Type")?.startsWith("text/event-stream")) await guard.lease?.release();
    return res;
  } catch (e) {
    await guard.lease?.release();
    throw e;
  }
}

async function handleChat(req: NextRequest, guard: { lease: GenerationLease | null }) {
  const requestStart = Date.now();
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
    SELECT id, ended_at, abuse_warnings, close_pending FROM chat_sessions WHERE id = ${sessionId} AND user_id = ${user.id}
  `) as { id: string; ended_at: string | null; abuse_warnings: number | null; close_pending: boolean | null }[];
  if (sessionRows.length === 0) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }
  // المحادثة اتقفلت قبل كده (الموديل أنهاها بعد تحذير) — السيرفر بيرفض أي رسالة جديدة
  // حتى لو حد بعت الطلب مباشرة من غير الواجهة.
  if (sessionRows[0].ended_at) {
    return NextResponse.json(
      { error: "المحادثة دي اتقفلت — ابدأ محادثة جديدة.", sessionEnded: true },
      { status: 409 }
    );
  }
  // عدد التحذيرات اللي اتسجّلت في ردود سابقة (مش الرد الحالي) — ده اللي بيحدد هل القفل مسموح.
  const warningsAtStart = Number(sessionRows[0].abuse_warnings ?? 0);
  // الموديل سأل المستخدم في ردّه السابق عن تأكيد قفل الشات؟ (صالح للرسالة دي بس — بنصفّره بعد ما الاتصال بالموديل ينجح)
  const closePendingAtStart = !!sessionRows[0].close_pending;

  const quotaCheck = await checkAndMaybeRenewQuota(user.id, isAdmin);
  if (quotaCheck.blocked) {
    return NextResponse.json({ error: quotaCheck.message, quotaExhausted: true }, { status: 403 });
  }
  // التوكنز المتبقية للمستخدم قبل الرد ده (null = أدمن، مفيش حد) — بنقطع الرد في نصه لو خلصت.
  const quotaRemaining = quotaCheck.remaining;

  // حدود الاستهلاك والتكلفة: (1) رسايل في الدقيقة/الساعة، (2) رد واحد شغال في نفس الوقت لكل مستخدم.
  // الأدمن مستثنى. شوف lib/usageGuard.ts لسبب الحدود دي.
  if (!isAdmin) {
    const rate = await checkMessageRate(user.id);
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

  // النص اللي كتبه المستخدم فعلًا (من غير بيانات الصور Base64 ولا محتوى الملفات المرفقة)
  const typedPrompt = extractAttachmentsPromptSection(extractAttachmentsMeta(userPrompt).visibleText).mainText;

  if (existing.length <= 1) {
    const titleSource = typedPrompt || extractAttachmentsMeta(userPrompt).attachments[0]?.name || "محادثة جديدة";
    const preview = titleSource.length > 30 ? titleSource.slice(0, 30) + "..." : titleSource;
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

  // 2.5) بحث تلقائي احتياطي (fallback): لو الرسالة واضح إنها محتاجة معلومة
  // حديثة، بنجهز نتايج مبدئية في السياق — لكن الأولوية لأداة web_search اللي
  // في إيد الموديل: هو اللي يقرر يبحث تاني باستعلام أدق أو مصادر محددة.
  // بنبعت للبحث نص المستخدم بس — قبل كده كان بيتبعت كل محتوى الملفات المرفقة،
  // فأي كلمة زي "latest" أو "price" جوه ملف كود كانت بتشغّل بحث وهمي.
  // ملحوظة ترتيب: SEARCH_ON متعرفة هنا فوق — لأنها مستخدمة في system prompt تحت
  // وفي قايمة الأدوات بعد كده (كانت متعرفة تحت فـ TypeScript كان بيرفض).
  const SEARCH_ON = await isDeepSearchEnabled();
  const deepSearch = await runDeepSearch(typedPrompt);

  // ملفات المشروع الموجودة في المحادثة (مرفوعة أو كتبها الموديل قبل كده) — بتحدد
  // هل نديه أدوات list_files/read_file ونقوله عنها في الـ system prompt.
  const initialProjectFiles = collectSessionProjectFiles(existing, "");

  const systemPromptContent =
    buildSystemPrompt({
      userName: user.displayName,
      totalTokens: totalAllocated,
      remainingTokens: Math.max(totalAllocated - usedTokensCount, 0),
      uiLanguage,
      webSearchAvailable: SEARCH_ON,
      sandboxAvailable: SANDBOX_ON,
      fileToolsAvailable: initialProjectFiles.length > 0,
      sandboxMemoryMb: getSandboxMemoryMb(),
      conversationEndAvailable: true,
      warningsIssued: warningsAtStart,
      closeConfirmationPending: closePendingAtStart,
    }) +
    (personalization ? `\n\n${personalization}` : "") +
    (deepSearch.performed && deepSearch.contextBlock ? `\n\n${deepSearch.contextBlock}` : "");

  // آخر 10 رسائل. المرفقات مبتتبعتش كاملة: الملفات الصغيرة inline (ميزانية محدودة)
  // والباقي (وأي zip) قايمة أسماء والموديل يقرا اللي يحتاجه بـ read_file. الصور
  // بتتبعت بس في آخر رسالة فيها صور. ده اللي كان بيخلّي رفع zip يسحب ~100 ألف توكن
  // في كل نداء (وفي كل جولة أدوات، وفي كل رسالة بعدها).
  const windowMsgs = existing.slice(-10);
  let lastUserIdx = -1;
  let lastImageIdx = -1;
  windowMsgs.forEach((m, i) => {
    if (m.role !== "user") return;
    lastUserIdx = i;
    if (extractAttachmentsMeta(m.content).attachments.some((a) => a.kind === "image" && a.previewUrl)) lastImageIdx = i;
  });

  const apiMessages: ApiMessage[] = [
    { role: "system", content: systemPromptContent },
    ...windowMsgs.map((m, i) => ({
      role: m.role,
      // رسايل المساعد المخزّنة فيها كتلة بيانات خطوات الـ Agent (مخرجات أوامر...) —
      // دي للواجهة بس، مش لازم تتبعت للموديل كنص وتاكل توكنز.
      content:
        m.role === "user"
          ? toApiUserContent(m.content, {
              inlineBudgetChars: i === lastUserIdx ? API_INLINE_TOTAL_MAX_CHARS : OLDER_INLINE_BUDGET_CHARS,
              includeImages: i === lastImageIdx,
            })
          : extractAgentStepsMeta(m.content).visibleText,
    })),
  ];

  // تكلفة رسالة المستخدم الحالية بعد التحويل (اللي بيتبعت للموديل فعلًا) — دي أساس الحسبة.
  const sentUser = apiUserContentLength(apiMessages[apiMessages.length - 1]?.content ?? "");
  const promptTokens = Math.floor(sentUser.chars / 3) + 10 + sentUser.images * IMAGE_TOKEN_ESTIMATE;

  // 3) اتصل بالموديل (مع منطق إعادة المحاولة/التراجع) قبل ما نبدأ نبعت أي حاجة للعميل
  const controller = new AbortController();
  req.signal.addEventListener("abort", () => controller.abort());

  // الأدوات المتاحة للموديل في الرد ده:
  // - web_search: أداة بحث حقيقي في إيد الموديل — هو اللي يقرر يبحث إمتى وكام مرة وبأنهي مصادر.
  // - list_files/read_file: لو فيه ملفات مشروع في المحادثة (مرفوعة أو كتبها الموديل) — من غير sandbox.
  // - run_command: لو E2B_API_KEY متظبط.
  // لو مفيش ولا واحدة، مبنبعتش tools خالص.
  // (SEARCH_ON متعرفة فوق جنب deepSearch)
  const availableTools: unknown[] = [
    ...(SEARCH_ON ? [WEB_SEARCH_TOOL] : []),
    ...(initialProjectFiles.length > 0 ? [LIST_FILES_TOOL, READ_FILE_TOOL] : []),
    ...(SANDBOX_ON ? [RUN_COMMAND_TOOL] : []),
    // أدوات الإشراف: تحذير محترم أولًا، وبعدين إنهاء المحادثة لو السلوك استمر
    ASK_CLOSE_CONFIRMATION_TOOL,
    WARN_USER_TOOL,
    END_CONVERSATION_TOOL,
  ];
  const HAS_TOOLS = availableTools.length > 0;
  const toolOptions = HAS_TOOLS ? { tools: availableTools } : {};

  let negotiated;
  try {
    negotiated = await negotiateUpstream(apiMessages, controller.signal, model, toolOptions);
  } catch {
    return NextResponse.json({ error: "تم إلغاء الطلب" }, { status: 499 });
  }

  if (!negotiated.ok) {
    return NextResponse.json({ error: negotiated.errorMessage }, { status: 502 });
  }

  // التأكيد المعلّق (لو كان موجود) اتستهلك برسالة المستخدم دي — بنصفّره هنا، ولو الموديل سأل تاني في الرد ده هيتسجّل من جديد في الآخر.
  if (closePendingAtStart) {
    try {
      await sql`UPDATE chat_sessions SET close_pending = FALSE WHERE id = ${sessionId} AND user_id = ${user.id}`;
    } catch (e) {
      console.error("failed to clear close_pending", e);
    }
  }

  const upstreamResponse = negotiated.response;
  const streamStart = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
      const encoder = new TextEncoder();
      let contentStartTime: number | null = null;

      // عدّاد لحظي لاستهلاك الرد ده: لو الرصيد خلص وانت لسه بتكتب، بنوقف الموديل فورًا.
      // (نفس تقدير estimateTokens: حرف/3، + برومبت المستخدم + مخرجات الأدوات)
      let emittedChars = 0;
      let toolTokens = 0;
      let quotaCutOff = false;
      let timeCutOff = false;
      const overBudget = () =>
        quotaRemaining !== null &&
        promptTokens + Math.floor(emittedChars / 3) + toolTokens >= quotaRemaining;
      const overTime = () => Date.now() - requestStart > HARD_STOP_MS;
      const pastRoundDeadline = () => Date.now() - requestStart > NO_NEW_ROUND_AFTER_MS;
      // بنوقف قراءة الموديل لو الرصيد خلص أو الوقت خلص، وبنفرّق بينهم عشان الرسالة الصح تظهر.
      const shouldStopNow = () => overBudget() || overTime();
      const markLimitStop = () => {
        if (overBudget()) quotaCutOff = true;
        else timeCutOff = true;
      };

      // بنبعت للعميل نسخة موحّدة من الـ delta (بدل الـ passthrough الخام)
      // عشان نقدر نتحكم في التوقيت ونعمل إعادة محاولة شفافة لو الاستجابة رجعت فاضية،
      // من غير ما نغيّر أي حاجة في شكل البيانات اللي lib/streamClient.ts بيستهلكها.
      const emit = (kind: "content" | "reasoning", text: string) => {
        if (kind === "content" && contentStartTime === null) contentStartTime = Date.now();
        emittedChars += text.length;
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

      const keepAlive = setInterval(() => {
        try {
          streamController.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // القناة مقفولة — تجاهل
        }
      }, KEEPALIVE_INTERVAL_MS);

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

      let result = await readUpstreamStream(upstreamResponse, req.signal, emit, shouldStopNow);
      if (result.stoppedByLimit) markLimitStop();

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
      // حلقة استدعاء الأدوات الحقيقية (web_search / list_files / read_file / run_command):
      // لو الموديل طلب أداة، بننفذها فعليًا، نبعت للعميل agent_event لحظي
      // (tool_start ثم tool_result/tool_error)، ونرجّع النتيجة الحقيقية للموديل
      // عشان يكمل ردّه — لحد MAX_TOOL_ROUNDS جولة. أوامر الشل كلها بتشتغل في
      // sandbox واحد بيعيش طول الرد (SandboxSession) بدل sandbox جديد لكل أمر.
      // ---------------------------------------------------------------
      const loopMessages: ApiMessage[] = [...apiMessages];
      const contentParts: string[] = [result.content];
      const reasoningParts: string[] = result.reasoning ? [result.reasoning] : [];
      const sandboxSteps: AgentStep[] = [];
      // أدوات الإشراف — بتتنفذ بصمت (من غير خطوات في الـ Activity Block) والحالة بتتحفظ في آخر الرد.
      let warnedThisTurn = false;
      let endRequested = false;
      let endReason = "";
      let endInitiator: "abuse" | "user_request" = "abuse";
      let askedCloseThisTurn = false; // الموديل طلب من المستخدم تأكيد القفل في الرد ده
      let extraTokens = 0; // توكنز ناتجة من جولات الأدوات (رد الموديل + مخرجات الأدوات)
      let round = 0;
      const session = SANDBOX_ON ? new SandboxSession(requestStart) : null;
      // حماية من حلقة الأوامر الفاشلة: الموديل كان بيكرر نفس الأمر المكسور (أو أوامر مكسورة ورا بعض)
      // لحد ما الجولات تخلص من غير ما يكتب ولا ملف. هنا بنمنع تكرار أمر فشل على نفس الملفات،
      // وبنسحب الأدوات بعد كام فشل ورا بعض.
      const failedCommands = new Set<string>();
      let consecutiveCommandFailures = 0;
      let toolsDisabled = false;
      const filesSignature = (files: { path: string; content: string }[]) => {
        const h = createHash("sha1");
        for (const f of files) {
          h.update(f.path);
          h.update("\u0000");
          h.update(f.content);
          h.update("\u0000");
        }
        return h.digest("hex");
      };

      const sendAgentEvent = (payload: Record<string, unknown>) => {
        try {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ agent_event: payload })}\n\n`));
        } catch {
          // تجاهل
        }
      };

      // نداء الموديل بعد نتايج الأدوات. لو فشل (سياق كبير، rate limit، مزوّد بيرفض
      // حقل reasoning_content...) بنجرب مرة تانية من غير reasoning_content قبل ما
      // نستسلم — وفي كل الأحوال مبنسكتش بصمت (شوف الرسالة تحت).
      const callUpstreamAfterTools = async (msgs: ApiMessage[], withTools: boolean) => {
        const opts = withTools ? toolOptions : {};
        let n = await negotiateUpstream(msgs, controller.signal, model, opts).catch(() => null);
        if (n?.ok || req.signal.aborted) return n;
        if (msgs.some((m) => m.reasoning_content)) {
          const cleaned = msgs.map(({ reasoning_content: _r, ...rest }) => rest as ApiMessage);
          n = await negotiateUpstream(cleaned, controller.signal, model, opts).catch(() => null);
        }
        return n;
      };

      try {
        while (
          HAS_TOOLS &&
          !toolsDisabled &&
          !result.stoppedByUser &&
          !quotaCutOff &&
          !timeCutOff &&
          result.toolCalls &&
          result.toolCalls.length > 0 &&
          round < MAX_TOOL_ROUNDS &&
          !pastRoundDeadline()
        ) {
          // الرصيد خلص (بسبب مخرجات الأدوات مثلًا) → مفيش جولة جديدة
          if (overBudget()) {
            quotaCutOff = true;
            result = { ...result, toolCalls: [] };
            break;
          }
          round += 1;
          const toolCalls: UpstreamToolCall[] = result.toolCalls.slice(0, MAX_CALLS_PER_ROUND);

          loopMessages.push({
            role: "assistant",
            content: result.content || "",
            tool_calls: toolCalls,
            // بعض الموديلات (DeepSeek في وضع التفكير) بترفض الجولة اللي بعد أداة لو
            // مرجّعناش تفكيرها معاها — فبنبعته لو موجود (والنداء بيتعاد من غيره لو اترفض).
            ...(result.reasoning ? { reasoning_content: result.reasoning } : {}),
          });

          const draftContent = contentParts.join("\n\n");
          const projectFiles = collectSessionProjectFiles(existing, draftContent);
          let roundFilesSig: string | null = null; // بيتحسب لو احتجناه بس

          for (const call of toolCalls) {
            const callName = call.function.name;
            let args: Record<string, unknown> = {};
            let argsValid = true;
            try {
              const parsed = JSON.parse(call.function.arguments || "{}");
              args = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
            } catch {
              argsValid = false;
            }

            const pushToolMessage = (payload: Record<string, unknown>) => {
              const content = JSON.stringify(payload);
              extraTokens += Math.floor(content.length / 3);
              toolTokens += Math.floor(content.length / 3);
              loopMessages.push({ role: "tool", tool_call_id: call.id, name: callName, content });
            };

            // --- ask_close_confirmation / warn_user / end_conversation (إنهاء المحادثة) ---
            if (isModerationTool(callName)) {
              const reason = cleanReason(args.reason);
              const askConfirmation = (error?: string) => {
                askedCloseThisTurn = true;
                pushToolMessage(
                  error
                    ? { ok: false, error }
                    : {
                        ok: true,
                        note:
                          "اتسجّل إنك بتطلب تأكيد. اكتب دلوقتي رسالة التأكيد: لو قفلت المحادثة مش هنقدر نتكلم هنا تاني، " +
                          "الخانة هتختفي، ولازم يعمل محادثة جديدة (الرسايل القديمة هتفضل مقروءة). واسأله بوضوح إذا كان متأكد، واستنى ردّه. " +
                          "ما تقفلش دلوقتي.",
                      }
                );
              };

              if (callName === "ask_close_confirmation") {
                if (endRequested) {
                  pushToolMessage({ ok: true, note: "المحادثة هتتقفل بالفعل — اكتب رسالة الوداع القصيرة بس." });
                } else {
                  askConfirmation();
                }
              } else if (callName === "warn_user") {
                warnedThisTurn = true;
                pushToolMessage({
                  ok: true,
                  note:
                    "التحذير اتسجّل. اكتب دلوقتي في ردك تحذير محترم وهادي وقصير للمستخدم (من غير عصبية ولا محاضرة)، " +
                    "وقول له إنك مبسوط تكمل لو الحوار رجع محترم. ما تقفلش المحادثة دلوقتي.",
                });
              } else if (endRequested) {
                pushToolMessage({ ok: true, note: "المحادثة هتتقفل بالفعل — اكتب رسالة الوداع القصيرة بس." });
              } else if (args.initiator === "user_request") {
                if (closePendingAtStart) {
                  endRequested = true;
                  endInitiator = "user_request";
                  endReason = reason || "المستخدم طلب إنهاء المحادثة وأكّد";
                  pushToolMessage({
                    ok: true,
                    note:
                      "المحادثة هتتقفل بعد ردك ده. اكتب وداع قصير ودافي (سطر أو سطرين) من غير ما تفتح موضوع جديد ولا تستدعي أدوات تانية.",
                  });
                } else {
                  // مفيش طلب تأكيد سابق: القفل مرفوض، ونسجّل طلب التأكيد دلوقتي.
                  askConfirmation(
                    "مرفوض: لازم تاخد تأكيد صريح من المستخدم الأول في رد سابق. اكتب دلوقتي رسالة التأكيد (القفل نهائي ومش هيقدر يكتب هنا تاني " +
                      "ولازم يعمل محادثة جديدة) واسأله إذا كان متأكد، واستنى ردّه."
                  );
                }
              } else if (warningsAtStart < MIN_WARNINGS_BEFORE_END) {
                // (initiator=abuse) مفيش تحذير سابق: القفل مرفوض، والتحذير بيتسجّل دلوقتي عشان المرة الجاية تبقى مسموحة.
                warnedThisTurn = true;
                pushToolMessage({
                  ok: false,
                  error:
                    "مرفوض: المستخدم لسه ما اتحذّرش في رد سابق. اكتب دلوقتي تحذير محترم وهادي بدل القفل، " +
                    "ولو كمّل بعد كده في نفس السلوك تقدر تقفل المحادثة.",
                });
              } else {
                endRequested = true;
                endInitiator = "abuse";
                endReason = reason || "استمرار سلوك مسيء بعد التحذير";
                pushToolMessage({
                  ok: true,
                  note:
                    "المحادثة هتتقفل بعد ردك ده. اكتب رسالة وداع قصيرة ومحترمة (سطرين على الأكثر) " +
                    "من غير ما تفتح موضوع جديد ولا تستدعي أدوات تانية.",
                });
              }
              continue;
            }

            // --- web_search (بحث حقيقي بطلب الموديل نفسه) ---
            if (callName === "web_search") {
              if (!argsValid) {
                const msg = "معاملات الأداة مش JSON صالح.";
                sendAgentEvent({ type: "tool_error", tool: "web_search", id: call.id, message: msg });
                sandboxSteps.push({ id: call.id, tool: "web_search", status: "error", message: msg });
                pushToolMessage({ ok: false, error: msg });
                continue;
              }
              const q = String(args.query ?? "").trim().slice(0, 120);
              sendAgentEvent({ type: "tool_start", tool: "web_search", id: call.id, path: q || "بحث" });
              const r = await runToolSearch(args);
              const detail = { queries: r.queries, sources: r.sources };
              sendAgentEvent({
                type: r.ok ? "tool_result" : "tool_error",
                tool: "web_search",
                id: call.id,
                path: q || "بحث",
                message: r.ok ? `${r.sources.length} نتيجة` : (r.error || "فشل البحث"),
                detail,
              });
              sandboxSteps.push({
                id: call.id,
                tool: "web_search",
                path: q || "بحث",
                status: r.ok ? "done" : "error",
                message: r.ok ? `${r.sources.length} نتيجة` : (r.error || "فشل البحث"),
                detail,
              });
              pushToolMessage(r.ok ? { ok: true, results: r.text } : { ok: false, error: r.error });
              continue;
            }

            // --- list_files / read_file (محلي، من غير sandbox) ---
            if (isProjectTool(callName)) {
              if (!argsValid) {
                const msg = "معاملات الأداة مش JSON صالح.";
                sendAgentEvent({ type: "tool_error", tool: callName, id: call.id, message: msg });
                sandboxSteps.push({ id: call.id, tool: callName, status: "error", message: msg });
                pushToolMessage({ ok: false, error: msg });
                continue;
              }
              const startPath = typeof args.path === "string" ? args.path : undefined;
              sendAgentEvent({ type: "tool_start", tool: callName, id: call.id, path: startPath });
              const r = runProjectTool(callName, args, projectFiles);
              sendAgentEvent({
                type: r.ok ? "tool_result" : "tool_error",
                tool: callName,
                id: call.id,
                path: r.path ?? startPath,
                message: r.message,
                detail: r.detail,
              });
              sandboxSteps.push({
                id: call.id,
                tool: callName,
                path: r.path ?? startPath,
                status: r.ok ? "done" : "error",
                message: r.message,
                detail: r.detail,
              });
              pushToolMessage(r.payload);
              continue;
            }

            // --- run_command ---
            if (callName !== "run_command") {
              const msg = `أداة غير معروفة: ${callName}`;
              sendAgentEvent({ type: "tool_error", tool: "run_command", id: call.id, message: msg });
              sandboxSteps.push({ id: call.id, tool: "run_command", status: "error", message: msg });
              pushToolMessage({ ok: false, error: msg });
              continue;
            }

            const command = argsValid ? String(args.command || "").trim() : "";
            const toolName = classifyCommandTool(command);

            if (!command) {
              const msg = argsValid
                ? "الموديل بعت أمر فاضي — اتجاهل."
                : "معاملات الأداة مش JSON صالح (غالبًا الأمر طويل جدًا واتقطع) — قسّم الأمر لأجزاء أصغر.";
              sendAgentEvent({ type: "tool_error", tool: toolName, id: call.id, message: msg });
              sandboxSteps.push({ id: call.id, tool: toolName, status: "error", message: msg });
              pushToolMessage({ ok: false, error: msg });
              continue;
            }

            if (!session) {
              const msg = "أداة run_command مش متاحة على السيرفر ده — استخدم list_files/read_file بس.";
              sendAgentEvent({ type: "tool_error", tool: toolName, id: call.id, message: msg });
              sandboxSteps.push({ id: call.id, tool: toolName, status: "error", message: msg });
              pushToolMessage({ ok: false, error: msg });
              continue;
            }

            // نفس الأمر بالظبط فشل قبل كده في الرد ده وملفات المشروع ماتغيّرتش → مفيش فايدة من إعادته.
            roundFilesSig = roundFilesSig ?? filesSignature(projectFiles);
            const cmdKey = `${command.replace(/\s+/g, " ")}\u0001${roundFilesSig}`;
            if (failedCommands.has(cmdKey)) {
              const msg = "نفس الأمر ده فشل قبل كده على نفس الملفات — ماتنفذش تاني.";
              sendAgentEvent({ type: "tool_error", tool: toolName, id: call.id, message: msg, detail: { command } });
              sandboxSteps.push({ id: call.id, tool: toolName, path: command, status: "error", message: msg, detail: { command } });
              pushToolMessage({
                ok: false,
                error:
                  "مرفوض: نفس الأمر ده اتنفذ قبل كده في الرد ده وفشل، وملفات المشروع ماتغيّرتش من ساعتها. " +
                  "غيّر الأمر فعليًا (صلّح الـ quoting أو قسّمه) أو صلّح الملفات الأول، أو اكتب السكربت كملف (path=\"...\") وشغّله. " +
                  "ولو هدفك تبني للمستخدم موقع/مشروع: اكتب الملفات كاملة بكتل path=\"...\" من غير ما تستنى نتيجة أمر.",
              });
              consecutiveCommandFailures += 1;
              continue;
            }

            // الأمر نفسه بيظهر للمستخدم فورًا (قبل ما يخلص) عشان يشوف إيه اللي بيتشغّل.
            sendAgentEvent({ type: "tool_start", tool: toolName, id: call.id, message: command, detail: { command } });

            const startedAt = Date.now();
            const run = await session.run(projectFiles, command);
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

            if (run.ok && !run.error) {
              consecutiveCommandFailures = 0;
            } else {
              consecutiveCommandFailures += 1;
              failedCommands.add(cmdKey);
            }

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

            pushToolMessage(
              run.error
                ? { ok: false, error: run.error }
                : {
                    ok: run.ok,
                    exitCode: run.exitCode,
                    stdout: run.stdout,
                    stderr: run.stderr,
                    ...(run.hint ? { hint: run.hint } : {}),
                    ...(session && session.skipped > 0
                      ? { note: `${session.skipped} ملف ماتكتبش في الـ sandbox (تعدّى الحد).` }
                      : {}),
                  }
            );
          }

          if (consecutiveCommandFailures >= MAX_CONSECUTIVE_COMMAND_FAILURES) {
            toolsDisabled = true;
            loopMessages.push({
              role: "user",
              content:
                `الأوامر فشلت ${consecutiveCommandFailures} مرات ورا بعض في الرد ده، فالأدوات اتسحبت منك دلوقتي — ماتحاولش تصلّح بالشل تاني. ` +
                "اعمل الآتي في ردك ده: (1) لو المستخدم طلب موقع/مشروع/كود، اكتب الملفات كاملة دلوقتي بكتل ```lang path=\"...\" " +
                "من غير ما تعتمد على نتيجة أي أمر. (2) قول للمستخدم بصراحة إيه اللي فشل (من غير ما تدّعي إن حاجة اشتغلت) وإيه اللي يقدر يجرّبه. " +
                "ماتكتبش أي استدعاء أداة.",
            });
          }

          const nextNegotiated = await callUpstreamAfterTools(loopMessages, !toolsDisabled);

          if (!nextNegotiated || !nextNegotiated.ok) {
            // قبل كده كان هنا break صامت والرد بيفصل من غير أي تفسير.
            if (!req.signal.aborted) {
              const note =
                "\n\n⚠️ الاتصال بالموديل فشل بعد ما نفّذت الأدوات، فمقدرتش أكمل الرد. اللي اتنفذ ظاهر في خطوات النشاط فوق — ابعت \"كمّل\" وهكمل من عندها.";
              emit("content", note);
              contentParts.push(note);
            }
            result = { ...result, toolCalls: [] };
            break;
          }

          result = await readUpstreamStream(nextNegotiated.response, req.signal, emit, shouldStopNow);
          if (result.stoppedByLimit) markLimitStop();
          contentParts.push(result.content);
          if (result.reasoning) reasoningParts.push(result.reasoning);
          extraTokens += estimateTokens(result.content, result.reasoning);
        }

        // الجولات خلصت والموديل لسه عايز يستدعي أدوات → نعمل نداء أخير من غير أدوات
        // عشان يكتب خلاصة للمستخدم بدل ما الرد يقف في النص من غير كلمة.
        if (
          HAS_TOOLS &&
          !toolsDisabled &&
          !result.stoppedByUser &&
          !quotaCutOff &&
          !timeCutOff &&
          result.toolCalls &&
          result.toolCalls.length > 0 &&
          (round >= MAX_TOOL_ROUNDS || pastRoundDeadline())
        ) {
          loopMessages.push({ role: "assistant", content: result.content || "" });
          loopMessages.push({
            role: "user",
            content:
              "وصلت للحد الأقصى من الأدوات أو الوقت في الرد ده. اكتب دلوقتي بدون استدعاء أدوات: " +
              "لو المستخدم طلب موقع/مشروع/كود ولسه ماكتبتش الملفات، اكتبها كاملة بكتل path=\"...\"، " +
              "وبعدها خلاصة قصيرة: إيه اللي اتعمل فعلًا، إيه اللي فشل أو لسه ناقص، والخطوة الجاية المقترحة.",
          });
          const finalNegotiated = await callUpstreamAfterTools(loopMessages, false);
          if (finalNegotiated?.ok) {
            result = await readUpstreamStream(finalNegotiated.response, req.signal, emit, shouldStopNow);
            if (result.stoppedByLimit) markLimitStop();
            contentParts.push(result.content);
            if (result.reasoning) reasoningParts.push(result.reasoning);
            extraTokens += estimateTokens(result.content, result.reasoning);
          } else if (!req.signal.aborted) {
            const note = "\n\n⚠️ وصلت للحد الأقصى من الأدوات ومقدرتش أكتب الخلاصة (مشكلة اتصال) — ابعت \"كمّل\".";
            emit("content", note);
            contentParts.push(note);
          }
        }
      } catch (e) {
        // أي exception غير متوقع جوه الحلقة كان بيفلت لحد start() فالستريم يتقفل بخطأ والرد مايتحفظش خالص.
        // دلوقتي بنسجّله، ونكمل للحفظ باللي اتكتب لحد هنا.
        console.error("[agent loop] unexpected error", e);
        if (!req.signal.aborted) {
          const note =
            "\n\n⚠️ حصل خطأ غير متوقع في السيرفر أثناء تنفيذ الأدوات فوقفت هنا. اللي اتنفذ ظاهر في خطوات النشاط — ابعت «كمّل» وأكمل من عندها.";
          emit("content", note);
          contentParts.push(note);
        }
      } finally {
        clearInterval(keepAlive);
        // الـ sandbox بيتقفل مهما حصل (نجاح/فشل/إيقاف من المستخدم/exception).
        await session?.close();
      }

      if (quotaCutOff) {
        const note = QUOTA_CUTOFF_NOTE;
        emit("content", note);
        contentParts.push(note);
      } else if (timeCutOff) {
        emit("content", TIME_CUTOFF_NOTE);
        contentParts.push(TIME_CUTOFF_NOTE);
      }

      let finalContent = contentParts.join("\n\n").trim();
      const finalReasoning = reasoningParts.join("\n\n").trim() || null;
      let usedFallback = false;

      // لسه فاضية بعد إعادة المحاولة، والمستخدم مش هو اللي وقفها — بدل ما نح��ظ
      // رسالة كذب زي "تمت المعالجة بنجاح"، نبعت للمستخدم رسالة صادقة توضح إن
      // في مشكلة مؤقتة في المزوّد، ومنخصمش عليه توكنز على رد ماتكتبش أصلاً.
      if (endRequested && !finalContent) {
        const msg = endInitiator === "user_request" ? DEFAULT_END_MESSAGE_USER : DEFAULT_END_MESSAGE;
        emit("content", msg);
        finalContent = msg;
      }

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
        // الحسبة: اللي اتبعت للموديل فعلًا من رسالة المستخدم (نص + قايمة/ملفات صغيرة، والصورة
        // بتقدير ثابت — مش Base64) + الرد + التفكير + جولات الأدوات. محتوى zip الكامل
        // مبيتحسبش لأنه مبيتبعتش.
        const totalTokens = usedFallback
          ? 0
          : promptTokens + estimateTokens(finalContent, finalReasoning ?? "") + extraTokens;
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
              ${!usedFallback && !result.stoppedByUser && (result.finishReason === "length" || quotaCutOff || timeCutOff)},
              ${totalTokens}
            )
          `;
        } catch (e) {
          console.error("failed to persist assistant message", e);
        }
        // الخصم مستقل عن حفظ الرسالة: الرد وصل للمستخدم فعلًا والتكلفة اتحملت، فلو الحفظ فشل مانسيبوش ببلاش.
        if (totalTokens > 0) {
          try {
            await deductTokens(user.id, totalTokens, isAdmin);
          } catch (e) {
            console.error("failed to deduct tokens", e);
          }
        }
      }

      // حالة الإنهاء: عداد التحذيرات، وطلب التأكيد المعلّق، وقفل المحادثة لو الموديل أنهاها (والسيرفر وافق).
      // بنحفظها بعد رسالة المساعد وقبل ما نبلّغ العميل، عشان أي إعادة تحميل تلاقي الحالة جاهزة.
      let sessionEnded = false;
      const endedBy = endInitiator === "user_request" ? "user" : "abuse";
      if (warnedThisTurn || endRequested || askedCloseThisTurn) {
        try {
          if (endRequested) {
            await sql`
              UPDATE chat_sessions
              SET ended_at = now(), ended_reason = ${endReason}, ended_by = ${endedBy}, close_pending = FALSE,
                  abuse_warnings = abuse_warnings + ${warnedThisTurn ? 1 : 0}, updated_at = now()
              WHERE id = ${sessionId} AND user_id = ${user.id}
            `;
            sessionEnded = true;
          } else {
            await sql`
              UPDATE chat_sessions
              SET abuse_warnings = abuse_warnings + ${warnedThisTurn ? 1 : 0},
                  close_pending = ${askedCloseThisTurn}, updated_at = now()
              WHERE id = ${sessionId} AND user_id = ${user.id}
            `;
          }
        } catch (e) {
          console.error("failed to persist end-conversation state", e);
        }
      }
      if (quotaCutOff) {
        try {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ quota_exhausted: true })}\n\n`));
        } catch {
          // العميل قطع الاتصال — هيلاقي الحالة من /api/quota
        }
      }
      if (sessionEnded) {
        try {
          streamController.enqueue(
            encoder.encode(`data: ${JSON.stringify({ session_ended: { reason: endReason, by: endedBy } })}\n\n`)
          );
        } catch {
          // العميل قطع الاتصال — هيلاقي الحالة من قايمة الجلسات
        }
      }

      // مهم جداً: نحفظ في الداتابيز الأول (فوق)، وبعدين نرسل إشارة [MLAG_SAVED]
      // وبعد كده نقفل القناة. لو قفلنا القناة قبل الحفظ، العميل يعمل refresh
      // ويلاقي الرسايل لسه متسجلتش — فيختفي الرد من الواجهة رغم إنه اتحفظ بعدها.
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
