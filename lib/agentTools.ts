/**
 * أدوات الـ Agent (function calling بصيغة OpenAI) اللي بنبعتها للموديل:
 *
 * - list_files / read_file: بيقروا ملفات المشروع (اللي المستخدم رفعها + اللي الموديل
 *   كتبها في المحادثة). دي اللي بتخلّينا منبعتش محتوى zip كامل في كل نداء —
 *   الموديل بيشوف قايمة أسماء ويقرا اللي محتاجه بس. مش محتاجة sandbox.
 * - run_command: تنفيذ أمر شل حقيقي جوه sandbox (E2B) — بيتفعّل بس لو E2B_API_KEY
 *   موجود. التنفيذ الفعلي في lib/sandbox.ts.
 */

import type { ProjectFile } from "./parseContent";
import { extractProjectFiles } from "./parseContent";
import { extractAgentStepsMeta } from "./agentEvents";
import type { AgentToolName } from "./agentEvents";
import { extractUserAttachmentFiles } from "./attachments";

export const LIST_FILES_TOOL = {
  type: "function",
  function: {
    name: "list_files",
    description:
      "اعرض قايمة ملفات المشروع (اللي المستخدم رفعها + اللي كتبتها إنت في المحادثة) مع عدد أسطر كل ملف. " +
      "استخدمها أول ما المستخدم يرفع مشروع/zip وقبل ما تفترض إن ملف موجود أو مش موجود. " +
      "ممكن تفلتر بـ prefix (مثال: \"components/\") أو تكتب جزء من الاسم في contains.",
    parameters: {
      type: "object",
      properties: {
        prefix: { type: "string", description: 'اختياري: اعرض بس الملفات اللي مسارها بيبدأ بـ ده، مثال "app/api/"' },
        contains: { type: "string", description: "اختياري: اعرض بس الملفات اللي مسارها فيه الجزء ده" },
      },
    },
  },
} as const;

export const READ_FILE_TOOL = {
  type: "function",
  function: {
    name: "read_file",
    description:
      "اقرا محتوى ملف واحد من ملفات المشروع (مسار نسبي زي components/ChatShell.tsx). بترجع أرقام الأسطر. " +
      "الملفات الكبيرة بترجع على أجزاء: حدد start_line و end_line (حد أقصى 400 سطر في النداء الواحد) " +
      "وكمّل بالجزء اللي بعده لو محتاج. اقرا بس اللي محتاجه — كل قراءة بتاخد من التوكنز.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "مسار الملف زي ما ظهر في قايمة الملفات" },
        start_line: { type: "integer", description: "أول سطر (يبدأ من 1). الافتراضي 1" },
        end_line: { type: "integer", description: "آخر سطر (شامل). الافتراضي start_line + 399" },
      },
      required: ["path"],
    },
  },
} as const;

export const RUN_COMMAND_TOOL = {
  type: "function",
  function: {
    name: "run_command",
    description:
      "شغّل أمر شل حقيقي (npm install, npm run build, npm test, python file.py, pytest ...) جوه sandbox معزول " +
      "فيه ملفات المشروع (المرفوعة + اللي كتبتها). قواعد مهمة:\n" +
      "• الأمر بيشتغل أصلاً جوه مجلد المشروع — ما تعملش `cd project` ولا `cd /home/...`؛ المسارات نسبية (components/App.tsx).\n" +
      "• الـ sandbox بيفضل عايش طول ردك الحالي: اللي بتعمله (npm install، ملفات اتعدّلت بالشل) بيفضل للأوامر اللي بعده في نفس الرد، " +
      "لكنه بيتمسح بعد ما الرد يخلص.\n" +
      "• ما تكتبش ملفات بـ heredoc (cat > f << EOF) — اكتب الملفات بكتلة ملف عادية (```lang path=\"...\") في ردك وهتلاقيها في الأمر اللي بعده.\n" +
      "• حد كل أمر حوالي دقيقتين ونص، وإجمالي أوامر الرد حوالي 4 دقايق، فاجمع أوامر مرتبطة في أمر واحد (npm install && npm run build).\n" +
      "• النتيجة (stdout/stderr/exit code) حقيقية 100%. استخدمها للتأكد من الكود بس، ومتشغّلش أوامر خطيرة أو ملهاش لازمة.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: 'الأمر اللي هيتشغل داخل مجلد المشروع مباشرة، مثال: "npm install && npm run build"',
        },
      },
      required: ["command"],
    },
  },
} as const;

export type ProjectToolName = "list_files" | "read_file";

export function isProjectTool(name: string): name is ProjectToolName {
  return name === "list_files" || name === "read_file";
}

/** بيحدد اسم الأداة المناسب للعرض في Activity Block (run_tests لو الأمر بيبان إنه اختبارات). */
export function classifyCommandTool(command: string): AgentToolName {
  return /\btest|pytest|jest|vitest|phpunit|go test|rspec\b/i.test(command) ? "run_tests" : "run_command";
}

/**
 * بيجمّع أحدث نسخة من كل ملفات المشروع — من مصدرين: (1) الملفات اللي الموديل
 * كتبها في ردوده القديمة + الرد الحالي (لسه بيتبني)، و(2) الملفات اللي المستخدم
 * نفسه رفعها كمرفقات في أي رسالة من رسايله. بنمشي على الرسايل بالترتيب الزمني
 * فلو الموديل عدّل ملف رفعه المستخدم، نسخة الموديل الأحدث هي اللي بتكسب.
 */
export function collectSessionProjectFiles(
  history: { role: string; content: string }[],
  currentContent: string
): ProjectFile[] {
  const byPath = new Map<string, string>();

  for (const msg of history) {
    if (msg.role === "assistant") {
      const { visibleText } = extractAgentStepsMeta(msg.content);
      for (const f of extractProjectFiles(visibleText)) {
        byPath.set(f.path, f.content);
      }
    } else if (msg.role === "user") {
      for (const f of extractUserAttachmentFiles(msg.content)) {
        byPath.set(f.path, f.content);
      }
    }
  }

  for (const f of extractProjectFiles(currentContent)) {
    byPath.set(f.path, f.content);
  }

  return Array.from(byPath.entries()).map(([path, content]) => ({ path, content }));
}

// ---------------------------------------------------------------------------
// تنفيذ list_files / read_file (محلي، من غير sandbox)
// ---------------------------------------------------------------------------

const READ_MAX_LINES = 400;
const READ_MAX_CHARS = 14_000;
const LIST_MAX_ENTRIES = 400;

export interface ProjectToolResult {
  /** الـ JSON اللي بيرجع للموديل كنتيجة الأداة */
  payload: Record<string, unknown>;
  ok: boolean;
  /** ملخص قصير للعرض في الـ Activity Block */
  message?: string;
  path?: string;
  detail?: { lines?: number; preview?: string };
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\/+/, "").trim();
}

function findFile(files: ProjectFile[], wanted: string): ProjectFile | null {
  const w = normalizePath(wanted);
  const exact = files.find((f) => normalizePath(f.path) === w);
  if (exact) return exact;
  // تسامح: الموديل ساعات بيكتب اسم الملف من غير المجلد، أو بيبدأ بـ project/
  const stripped = w.replace(/^project\//, "");
  const byStripped = files.find((f) => normalizePath(f.path) === stripped);
  if (byStripped) return byStripped;
  const suffix = files.filter((f) => normalizePath(f.path).endsWith("/" + stripped));
  return suffix.length === 1 ? suffix[0] : null;
}

export function runProjectTool(
  name: ProjectToolName,
  args: Record<string, unknown>,
  files: ProjectFile[]
): ProjectToolResult {
  if (name === "list_files") {
    const prefix = typeof args.prefix === "string" ? normalizePath(args.prefix) : "";
    const contains = typeof args.contains === "string" ? args.contains.trim().toLowerCase() : "";
    const matched = files
      .filter((f) => (!prefix || normalizePath(f.path).startsWith(prefix)) && (!contains || f.path.toLowerCase().includes(contains)))
      .sort((a, b) => a.path.localeCompare(b.path));
    const shown = matched.slice(0, LIST_MAX_ENTRIES);
    const listing = shown.map((f) => `${f.path} (${f.content ? f.content.split("\n").length : 0} سطر)`);
    return {
      ok: true,
      payload: {
        ok: true,
        total: matched.length,
        files: listing,
        ...(matched.length > shown.length ? { note: `اتعرض أول ${shown.length} بس — استخدم prefix/contains للتضييق.` } : {}),
        ...(files.length === 0 ? { note: "مفيش ملفات مشروع في المحادثة دي لسه." } : {}),
      },
      message: `${matched.length} ملف`,
      detail: { lines: matched.length, preview: listing.slice(0, 12).join("\n") + (listing.length > 12 ? "\n…" : "") },
    };
  }

  // read_file
  const rawPath = typeof args.path === "string" ? args.path : "";
  if (!rawPath.trim()) {
    return { ok: false, payload: { ok: false, error: "لازم تحدد path." }, message: "path فاضي" };
  }
  const file = findFile(files, rawPath);
  if (!file) {
    const base = normalizePath(rawPath).split("/").pop() || "";
    const similar = base
      ? files.filter((f) => f.path.toLowerCase().includes(base.toLowerCase())).slice(0, 8).map((f) => f.path)
      : [];
    return {
      ok: false,
      path: rawPath,
      payload: {
        ok: false,
        error: `الملف "${rawPath}" مش موجود في ملفات المشروع.`,
        ...(similar.length ? { similar } : {}),
        hint: "استخدم list_files عشان تشوف المسارات الصح. لو الملف مش في القايمة يبقى ماتقراش وقت الرفع (أرشيف كبير/ملف ثنائي/node_modules).",
      },
      message: "الملف مش موجود",
    };
  }

  const allLines = file.content.replace(/\r\n?/g, "\n").split("\n");
  const total = allLines.length;
  const start = Math.max(1, Math.floor(Number(args.start_line) || 1));
  const requestedEnd = Math.floor(Number(args.end_line) || start + READ_MAX_LINES - 1);
  let end = Math.min(total, Math.max(start, requestedEnd), start + READ_MAX_LINES - 1);

  if (start > total) {
    return {
      ok: false,
      path: file.path,
      payload: { ok: false, error: `الملف فيه ${total} سطر بس، وانت طلبت من السطر ${start}.` },
      message: "خارج النطاق",
    };
  }

  let chunk = allLines.slice(start - 1, end);
  let text = chunk.map((l, i) => `${start + i}\t${l}`).join("\n");
  if (text.length > READ_MAX_CHARS) {
    // قص على حدود الأسطر عشان ميقطعش سطر في النص
    let acc = 0;
    let keep = 0;
    for (const l of chunk) {
      const len = l.length + 8;
      if (acc + len > READ_MAX_CHARS) break;
      acc += len;
      keep++;
    }
    keep = Math.max(keep, 1);
    chunk = chunk.slice(0, keep);
    end = start + keep - 1;
    text = chunk.map((l, i) => `${start + i}\t${l}`).join("\n");
  }

  const more = end < total;
  return {
    ok: true,
    path: file.path,
    payload: {
      ok: true,
      path: file.path,
      total_lines: total,
      start_line: start,
      end_line: end,
      content: text,
      ...(more ? { next: `فيه ${total - end} سطر كمان — كمّل بـ start_line=${end + 1}` } : {}),
    },
    message: `${start}–${end} من ${total}`,
    detail: { lines: end - start + 1, preview: chunk.slice(0, 6).join("\n") + (chunk.length > 6 ? "\n…" : "") },
  };
}
