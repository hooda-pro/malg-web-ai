/**
 * أحداث "الـAgent" اللي بتتبعت جوه نفس ستريم الشات (SSE) وبتتعرض كـ Activity
 * Block فوق رد الموديل. كل الأحداث دي لازم تبقى انعكاس لحاجة حصلت فعلًا —
 * ممنوع نخترع خطوة (زي "تشغيل بناء") لو مفيش تنفيذ حقيقي وراها.
 *
 * الأدوات الحقيقية المتاحة دلوقتي:
 * - web_search: بحث فعلي بيحصل قبل ما رد الموديل يبدأ (طبقة lib/webSearch.ts)،
 *   فبيتسجل كخطوة "مكتملة" من بداية الستريم مباشرة (مش لحظي أثناء الكتابة،
 *   لأنه فعليًا خلص قبل ما نبعت أي حرف للعميل).
 * - write_file: لما الموديل يبدأ/يخلص كتابة كتلة ملف (```lang path="...") —
 *   ده حدث حقيقي وبنكتشفه لحظيًا وإحنا بنبعت الـ content deltas.
 * - run_command / run_tests: تنفيذ أمر شل حقيقي جوه sandbox حقيقي ومعزول
 *   (E2B، شوف lib/sandbox.ts) — بيظهر بس لو متظبط متغير البيئة E2B_API_KEY،
 *   وبيتنادى عن طريق function calling حقيقي (الموديل بيطلبه، إحنا بننفذه
 *   فعليًا، وبنرجّعله النتيجة الحقيقية). شوف lib/agentTools.ts والحلقة في
 *   app/api/chat/route.ts.
 *
 * التصميم قابل للتوسّع: أي أداة حقيقية تتضاف مستقبلًا (قراءة ملفات من مشروع
 * حقيقي...) بتضيف كائن جديد بنفس الشكل من غير ما تكسر أي حاجة موجودة.
 */

export type AgentToolName =
  | "web_search"
  | "read_file"
  | "write_file"
  | "edit_file"
  | "create_file"
  | "delete_file"
  | "list_files"
  | "search_files"
  | "run_command"
  | "run_tests"
  | "mcp";

export type AgentEventType =
  | "tool_start"
  | "tool_result"
  | "tool_error"
  | "task_complete";

/**
 * تفاصيل حقيقية لخطوة واحدة — بتظهر لما المستخدم يضغط على الخطوة جوه الـ
 * Activity Block. كل حقل اختياري وبيتملي بس لو فعلاً حصل (مفيش مخرجات وهمية).
 */
export interface AgentStepDetail {
  /** الأمر الفعلي اللي اتنفذ (run_command / run_tests) */
  command?: string;
  /** مخرجات الأمر الحقيقية (آخر جزء منها لو طويلة) */
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  /** المدة الفعلية للتنفيذ بالمللي ثانية */
  durationMs?: number;
  /** لأدوات الملفات: عدد الأسطر + أول أسطر كمعاينة */
  lines?: number;
  preview?: string;
  /** للبحث: الاستعلامات اللي اتبعتت فعلاً + المصادر اللي رجعت */
  queries?: string[];
  sources?: { title: string; url: string }[];
}

export interface AgentEvent {
  type: AgentEventType;
  tool: AgentToolName;
  /** معرّف فريد للخطوة عشان نقدر نربط tool_start بالـ tool_result/tool_error بتاعه */
  id: string;
  /** مسار الملف (لأدوات الملفات) أو استعلام البحث (لـ web_search) */
  path?: string;
  message?: string;
  detail?: AgentStepDetail;
}

/** حالة خطوة واحدة في الـ Activity Block بعد تجميع الأحداث */
export type AgentStepStatus = "running" | "done" | "error";

export interface AgentStep {
  id: string;
  tool: AgentToolName;
  path?: string;
  message?: string;
  status: AgentStepStatus;
  detail?: AgentStepDetail;
}

/** هل الخطوة فيها حاجة تتعرض لما تتفتح؟ (لو لأ، الصف بيفضل سطر عادي مش قابل للضغط) */
export function stepHasDetail(step: AgentStep): boolean {
  const d = step.detail;
  if (step.status === "error" && (step.message || d)) return true;
  if (!d) return false;
  return !!(
    d.command ||
    d.stdout ||
    d.stderr ||
    d.preview ||
    d.queries?.length ||
    d.sources?.length ||
    typeof d.lines === "number" ||
    typeof d.exitCode === "number"
  );
}

const ANSI_REGEX = /\u001b\[[0-9;?]*[A-Za-z]/g;

/**
 * بينضّف ويقصّ مخرجات أمر عشان تتخزن/تتبعت: بيشيل ألوان الترمنال (ANSI)
 * وأي حرف من حروف الفاصل الداخلي بتاع كتلة البيانات، وبيحتفظ بـ *آخر* جزء
 * (لأن الخطأ الحقيقي في الـ build/test غالبًا في آخر المخرجات).
 */
export function clipOutput(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(ANSI_REGEX, "").replace(/\uE000/g, "").replace(/\r\n?/g, "\n").trimEnd();
  if (!clean) return undefined;
  return clean.length > max ? "…\n" + clean.slice(clean.length - max) : clean;
}

/** أول أسطر من محتوى ملف كمعاينة صغيرة (بدون ما نخزن الملف كله مرتين). */
export function filePreview(content: string, maxLines = 10, maxChars = 700): { lines: number; preview: string } {
  const all = content.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  let preview = all.slice(0, maxLines).join("\n");
  if (preview.length > maxChars) preview = preview.slice(0, maxChars);
  if (all.length > maxLines || preview.length < content.length) preview += "\n…";
  return { lines: all.length, preview };
}

const TOOL_LABELS: Record<AgentToolName, { verbDoing: string; verbDone: string }> = {
  web_search: { verbDoing: "بيبحث في الإنترنت", verbDone: "بحث في الإنترنت" },
  read_file: { verbDoing: "بيقرأ", verbDone: "قرأ" },
  write_file: { verbDoing: "بيكتب", verbDone: "كتب" },
  edit_file: { verbDoing: "بيعدّل", verbDone: "عدّل" },
  create_file: { verbDoing: "بينشئ", verbDone: "أنشأ" },
  delete_file: { verbDoing: "بيحذف", verbDone: "حذف" },
  list_files: { verbDoing: "بيستعرض الملفات", verbDone: "استعرض الملفات" },
  search_files: { verbDoing: "بيدور جوه الملفات", verbDone: "دوّر جوه الملفات" },
  run_command: { verbDoing: "بيشغّل أمر", verbDone: "شغّل أمر" },
  run_tests: { verbDoing: "بيشغّل الاختبارات", verbDone: "شغّل الاختبارات" },
  mcp: { verbDoing: "بيستخدم أداة خارجية", verbDone: "استخدم أداة خارجية" },
};

export function agentStepLabel(step: AgentStep): string {
  const labels = TOOL_LABELS[step.tool] ?? { verbDoing: step.tool, verbDone: step.tool };
  const verb = step.status === "running" ? labels.verbDoing : labels.verbDone;
  if (step.path) return `${verb} ${step.path}`;
  if (step.message) return `${verb} — ${step.message}`;
  return verb;
}

/** بيحوّل قايمة أحداث خام (اتقرت من الستريم) لقايمة خطوات نظيفة (كل خطوة بحالتها النهائية). */
export function reduceAgentEvents(events: AgentEvent[]): AgentStep[] {
  const steps = new Map<string, AgentStep>();
  const order: string[] = [];

  for (const ev of events) {
    if (ev.type === "task_complete") continue;
    if (!steps.has(ev.id)) {
      order.push(ev.id);
      steps.set(ev.id, { id: ev.id, tool: ev.tool, path: ev.path, message: ev.message, status: "running" });
    }
    const step = steps.get(ev.id)!;
    if (ev.path) step.path = ev.path;
    if (ev.detail) step.detail = { ...step.detail, ...ev.detail };
    if (ev.type === "tool_result") {
      step.status = "done";
      if (ev.message) step.message = ev.message;
    } else if (ev.type === "tool_error") {
      step.status = "error";
      step.message = ev.message || step.message;
    }
  }

  return order.map((id) => steps.get(id)!);
}

interface StreamingFileBlockLike {
  type: "prose" | "fileblock";
  path?: string;
  isComplete?: boolean;
  /** محتوى الكتلة لحد اللحظة دي (بيتعبّى أثناء البث) */
  body?: string;
}

/**
 * بيحوّل أجزاء الملفات المكتشفة أثناء البث (lib/parseContent.ts) لخطوات
 * write_file حقيقية — كل ملف لسه بيتكتب (مش مقفول بعد) بيبقى "running"،
 * وأي ملف اتقفلت كتلته بيبقى "done". ده انعكاس مباشر لحدث حقيقي (الموديل
 * فعلاً بيكتب الكتلة دي دلوقتي)، مش خطوة متخيّلة.
 */
export function fileStepsFromStreamingSegments(segments: StreamingFileBlockLike[]): AgentStep[] {
  const steps: AgentStep[] = [];
  let fileIndex = 0;
  for (const seg of segments) {
    if (seg.type !== "fileblock") continue;
    fileIndex += 1;
    steps.push({
      id: `file-${fileIndex}-${seg.path}`,
      tool: "write_file",
      path: seg.path,
      status: seg.isComplete ? "done" : "running",
      detail: seg.body ? filePreview(seg.body) : undefined,
    });
  }
  return steps;
}

/**
 * الوسم اللي بيلف كتلة بيانات خطوات الـAgent المخزّنة جوه نص رسالة المساعد.
 * زي وسوم المرفقات بالظبط: لازم حروف Unicode عادية مش بايت NUL (\u0000)،
 * لأن Postgres بيرفض تخزين نص فيه NUL في عمود text.
 */
export const AGENT_STEPS_META_START = "\uE000MLAG_AGENT_STEPS_START\uE000";
export const AGENT_STEPS_META_END = "\uE000MLAG_AGENT_STEPS_END\uE000";

/**
 * بيبني كتلة بيانات مخفية (JSON) بتتحط في آخر نص رسالة المساعد المخزّنة —
 * عشان لما المحادثة تتفتح تاني، الـ ActivityBlock يقدر يترسم في حالته
 * النهائية (كل الخطوات "done") من غير ما يحتاج يعيد تحليل نص الرد كله.
 */
export function buildAgentStepsMetaBlock(steps: AgentStep[]): string {
  if (steps.length === 0) return "";
  // أي خطوة لسه "running" وقت الحفظ (نادر، بس ممكن لو الستريم اتقفل فجأة)
  // بنسجّلها "done" في المخزّن — مفيش داعي نعرض "جاري..." لرد خلص فعلًا.
  const finalized = steps.map((s) => (s.status === "running" ? { ...s, status: "done" as const } : s));
  return `\n${AGENT_STEPS_META_START}${JSON.stringify(finalized)}${AGENT_STEPS_META_END}`;
}

/** بيفصل كتلة بيانات خطوات الـAgent عن نص رسالة المساعد الفعلي. */
export function extractAgentStepsMeta(content: string): { visibleText: string; steps: AgentStep[] } {
  const startIdx = content.indexOf(AGENT_STEPS_META_START);
  if (startIdx === -1) return { visibleText: content, steps: [] };

  const endIdx = content.indexOf(AGENT_STEPS_META_END);
  if (endIdx === -1) return { visibleText: content, steps: [] };

  const jsonStr = content.slice(startIdx + AGENT_STEPS_META_START.length, endIdx);
  let steps: AgentStep[] = [];
  try {
    steps = JSON.parse(jsonStr);
  } catch {
    steps = [];
  }

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + AGENT_STEPS_META_END.length);
  return { visibleText: (before + after).trimEnd(), steps };
}
