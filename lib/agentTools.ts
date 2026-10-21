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
import {
  MAX_SKILL_BODY_CHARS,
  MAX_SKILL_DESC_CHARS,
  MAX_SKILL_FILE_CHARS,
  MAX_SKILL_FILES,
  MAX_SKILL_NAME_CHARS,
  MAX_SKILLS_PAYLOAD_TOTAL_CHARS,
  fallbackDescription,
  isTextSkillFile,
  parseSkillFrontmatter,
  sanitizeSkillPath,
  type IncomingSkill,
} from "./skills";
import { extractDeliverableFiles } from "./parseContent";
import { extractAgentStepsMeta, filePreview } from "./agentEvents";
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

export const EDIT_FILE_TOOL = {
  type: "function",
  function: {
    name: "edit_file",
    description:
      "عدّل جزءًا من ملف مشروع موجود بدل إعادة كتابة الملف كله: حدد المسار (path) " +
      "والنص القديم حرفيًا (old_string) والبديل (new_string). للتعديلات الصغيرة " +
      "(سطر، دالة، قيمة) — أوفر بكتير من كتابة الملف كاملًا. النص القديم لازم يطابق " +
      "الموجود حرفيًا بما فيه المسافات والأسطر — لو مش متأكد اقرأ الملف بـ read_file " +
      "الأول. ممنوع لملف جديد (اكتبه بكتلة path)، وممنوع old_string فاضي، ولو النص " +
      "مكرر في الملف زوّد سياقًا حوله لحد ما يبقى فريدًا.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "مسار الملف زي ما ظهر في قايمة الملفات" },
        old_string: { type: "string", description: "الجزء المراد استبداله حرفيًا (لازم يوجد مرة واحدة بالظبط)" },
        new_string: { type: "string", description: "النص البديل (ممكن فاضي للحذف)" },
      },
      required: ["path", "old_string", "new_string"],
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
      "• حد كل أمر حوالي دقيقتين ونص، وإجمالي أوامر الرد حوالي 3 دقايق، فاجمع أوامر مرتبطة في أمر واحد (npm install && npm run build).\n" +
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

export const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "ابحث في الإنترنت الحقيقي لما تحتاج معلومة حديثة أو متغيرة (أسعار، أخبار، إصدارات، توثيق جديد...). " +
      "استخدمها بنفسك كل ما تحتاج — تقدر تبحث أكتر من مرة في نفس الرد لو النتايج سطحية أو محتاج جوانب تانية. " +
      "اختار كلمات البحث بعناية، وحدد include_domains لو عايز مصادر معينة (مثال: docs.python.org)، " +
      "أو exclude_domains لو عايز تستبعد مواقع ضعيفة. ما تستخدمهاش للمعرفة الثابتة اللي عندك أصلًا.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "كلمات البحث — مختصرة ومحددة، بالإنجليزية غالبًا لنتايج أدق" },
        max_results: { type: "integer", description: "عدد النتايج (1-10، الافتراضي 5)" },
        include_domains: {
          type: "array",
          items: { type: "string" },
          description: "اختياري: دومينات تحصر فيها البحث (مثال: [\"wikipedia.org\"])",
        },
        exclude_domains: {
          type: "array",
          items: { type: "string" },
          description: "اختياري: دومينات تستبعدها من النتايج",
        },
      },
      required: ["query"],
    },
  },
} as const;

export const READ_SKILL_TOOL = {
  type: "function",
  function: {
    name: "read_skill",
    description:
      "اقرا النص الكامل (SKILL.md) لمهارة (skill) محلية فعّلها المستخدم على جهازه. " +
      "استدعيها أول ما طلب المستخدم يتقاطع مع موضوع مهارة من قايمة المهارات المحلية " +
      "(تصميم، كتابة، تحليل، سكربتات...). بترجع التوجيهات الكاملة اللي لازم تتبعها بالحرف.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم المهارة بالظبط زي ما ظهر في قايمة المهارات في السياق" },
      },
      required: ["name"],
    },
  },
} as const;

export const READ_SKILL_FILE_TOOL = {
  type: "function",
  function: {
    name: "read_skill_file",
    description:
      "اقرا ملف إضافي مرفوق بمهارة محلية (سكربت/قالب/مرجع جوه مجلد المهارة). " +
      "استدعيها بعد read_skill لو نص المهارة أشار لملف إضافي — واعتمد مضمونه فعليًا. " +
      "حدد اسم المهارة والمسار النسبي للملف زي ما ظهر بين قوسين بعد اسم المهارة.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم المهارة (اللي الطلب يخصها)" },
        path: { type: "string", description: 'مسار الملف النسبي جوه المهارة، مثال: "scripts/build.sh"' },
      },
      required: ["name", "path"],
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
      for (const f of extractDeliverableFiles(visibleText)) {
        byPath.set(f.path, f.content);
      }
    } else if (msg.role === "user") {
      for (const f of extractUserAttachmentFiles(msg.content)) {
        byPath.set(f.path, f.content);
      }
    }
  }

  for (const f of extractDeliverableFiles(currentContent)) {
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
  /** النسخة الكاملة بعد التعديل (لأدوات التعديل فقط) — السيرفر يضيفها ككتلة ملف */
  updated?: { path: string; content: string };
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.?\/+/, "").trim();
}

export function findFile(files: ProjectFile[], wanted: string): ProjectFile | null {
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

/**
 * تنفيذ edit_file: استبدال جراحي old_string ← new_string داخل ملف موجود.
 * القواعد الصارمة (زي Claude Code): الملف لازم موجود، والنص القديم لازم يطابق
 * حرفيًا مرة واحدة بالظبط — وإلا رسالة خطأ توجّه الموديل للتصحيح بدل التخمين.
 */
export function runEditTool(args: Record<string, unknown>, files: ProjectFile[]): ProjectToolResult {
  const rawPath = typeof args.path === "string" ? args.path : "";
  const oldString = typeof args.old_string === "string" ? args.old_string : "";
  if (!rawPath.trim()) {
    return { ok: false, payload: { ok: false, error: "لازم تحدد path." }, message: "path فاضي" };
  }
  if (!oldString) {
    return {
      ok: false,
      payload: { ok: false, error: "old_string فاضي — حدد الجزء المراد استبداله حرفيًا." },
      message: "old_string فاضي",
    };
  }
  if (typeof args.new_string !== "string") {
    return {
      ok: false,
      payload: { ok: false, error: "لازم تحدد new_string (ممكن فاضي للحذف)." },
      message: "new_string ناقص",
    };
  }
  const file = findFile(files, rawPath);
  if (!file) {
    return {
      ok: false,
      path: rawPath,
      payload: {
        ok: false,
        error: "الملف " + rawPath + " مش موجود في ملفات المشروع.",
        hint: "لو ملف جديد اكتبه بكتلة path بدل الأداة. لو موجود، هات المسار الصح بـ list_files.",
      },
      message: "الملف مش موجود",
    };
  }
  // توحيد نهايات الأسطر قبل المطابقة (read_file بيرجّع LF — فالنسخ منه بيطابق دايمًا)
  const content = file.content.replace(/\r\n?/g, "\n");
  const occurrences = content.split(oldString).length - 1;
  if (occurrences === 0) {
    return {
      ok: false,
      path: file.path,
      payload: {
        ok: false,
        error: "النص القديم مش موجود حرفيًا في الملف (غالبًا فرق مسافات أو أسطر).",
        hint: "اقرأ الجزء ده بـ read_file وانسخ منه حرفيًا — أو استخدم edit_file_lines لو عارف أرقام الأسطر.",
      },
      message: "لا تطابق",
    };
  }
  if (occurrences > 1) {
    return {
      ok: false,
      path: file.path,
      payload: {
        ok: false,
        error: "النص القديم مكرر " + occurrences + " مرات — لازم يكون فريدًا.",
        hint: "زوّد سياقًا حوله (سطور قبله وبعده) لحد ما يبقى مرة واحدة بس.",
      },
      message: "نص مكرر",
    };
  }
  const updated = content.replace(oldString, args.new_string as string);
  const oldLines = content.split("\n").length;
  const newLines = updated.split("\n").length;
  const delta = newLines - oldLines;
  const added = args.new_string as string;
  const preview = added.trim() ? filePreview(added, 6, 400) : { lines: 0, preview: "(حذف)" };
  return {
    ok: true,
    path: file.path,
    payload: { ok: true, path: file.path, ...(delta !== 0 ? { line_delta: delta } : {}) },
    message: "عدّل " + file.path + (delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta} سطر)` : ""),
    detail: { lines: preview.lines, preview: preview.preview },
    updated: { path: file.path, content: updated },
  };
}

// ---------------------------------------------------------------------------
// edit_file_lines — تعديل بنطاق أسطر (بلا مطابقة نصية). read_file بيرجّع أرقام
// أسطر — فالموديل بيحط ال range مباشرة: صفر أخطاء مسافات، وسريع للملفات الضخمة.
// multi_edit — دفعة تعديلات جراحية (old→new) على نفس الملف في جولة واحدة.
// ---------------------------------------------------------------------------

const MAX_EDIT_LINES_REPLACEMENT_CHARS = 60_000;
const MAX_MULTI_EDIT_EDITS = 10;

export const EDIT_FILE_LINES_TOOL = {
  type: "function",
  function: {
    name: "edit_file_lines",
    description:
      "عدّل ملف موجود بديلاً للنطاق: حدد start_line وend_line (من قراءة read_file المرقّمة) " +
      "والنص البديل replacement (ممكن أسطر جديدة، ممكن محذوف بـreplacement=\"\"). " +
      "دي أضمن طريقة للملفات الطويلة — مفيش مطابقة نصية ولا أخطاء مسافات، ولا حاجة لإعادة كتابة الملف كله. " +
      "الأسطر بخارج النطاق بتفضل زي هيها بالظبط.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "مسار الملف موجود في المشروع" },
        start_line: { type: "integer", description: "أول سطر يتعدل (من 1 — زي ما ظهر في read_file)" },
        end_line: { type: "integer", description: "آخر سطر (شامل). الافتراضي start_line (سطر واحد)" },
        replacement: { type: "string", description: "النص البديل للأسطر دي (فاضي يبقى حذف للنطاق)" },
      },
      required: ["path", "start_line", "replacement"],
    },
  },
} as const;

export const MULTI_EDIT_TOOL = {
  type: "function",
  function: {
    name: "multi_edit",
    description:
      "طبّق مجموعة تعديلات جراحية (old_string → new_string) على ملف واحد في جولة واحدة بدل استدعاء edit_file أكتر من مرة. " +
      "كل نص قديم لازم يطابق مرة واحدة بالظبط في حالته وقت الدور بتاعه (تعديل سابق بيغير النص اللي بعده يقييم عليه). " +
      "لو واحد فشل، مفيش أي تعديل يتطبق — صسّله وتابع. للأنطاق الكبيرة استخدم edit_file_lines بدلها.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "مسار الملف" },
        edits: {
          type: "array",
          description: "لحد 10 — بالترتيب اللي المفروض يتطبقوا بيه",
          items: {
            type: "object",
            properties: {
              old_string: { type: "string", description: "النص القديم حرفيًا (فريد وقت الدور بتاعه)" },
              new_string: { type: "string", description: "النص البديل" },
            },
            required: ["old_string", "new_string"],
          },
        },
      },
      required: ["path", "edits"],
    },
  },
} as const;

/** edit_file_lines: استبدال نطاق أسطر بالمؤشر مرت، خالي من مشاكل التطابقات والمسافات. */
export function runEditLinesTool(args: Record<string, unknown>, files: ProjectFile[]): ProjectToolResult {
  const rawPath = typeof args.path === "string" ? args.path : "";
  if (!rawPath.trim()) {
    return { ok: false, payload: { ok: false, error: "لازم تحدد path." }, message: "path فاضي" };
  }
  const replacement = typeof args.replacement === "string" ? args.replacement : "";
  if (replacement.length > MAX_EDIT_LINES_REPLACEMENT_CHARS) {
    return {
      ok: false,
      path: rawPath,
      payload: {
        ok: false,
        error: `replacement أكبر من الحد (${MAX_EDIT_LINES_REPLACEMENT_CHARS} حرف) — قسّم التعديل على أكثر من نداء.`,
      },
      message: "النص البديل ضخم",
    };
  }
  const file = findFile(files, rawPath);
  if (!file) {
    return {
      ok: false,
      path: rawPath,
      payload: {
        ok: false,
        error: "الملف " + rawPath + " مش موجود في ملفات المشروع.",
        hint: "استخدم list_files للمسارات الصحيحة، أو اكتب الملف بكتلة path لو جديد.",
      },
      message: "الملف مش موجود",
    };
  }
  const lines = file.content.replace(/\r\n?/g, "\n").split("\n");
  const total = lines.length;
  const start = Math.floor(Number(args.start_line) || 0);
  if (!start || start < 1 || start > total) {
    return {
      ok: false,
      path: file.path,
      payload: { ok: false, error: `start_line ${args.start_line} خارج النطاق (الملف فيه ${total} سطر).`, hint: "اقرأ الملف بـ read_file الأول عشان تاخد الأرقام الصح." },
      message: "start_line خارج النطاق",
    };
  }
  const requestedEnd = Math.floor(Number(args.end_line) || start);
  const end = Math.min(total, Math.max(start, requestedEnd));
  const removed = lines.slice(start - 1, end);
  const replacementLines = replacement === "" ? [] : replacement.replace(/\r\n?/g, "\n").split("\n");
  const updated = [...lines.slice(0, start - 1), ...replacementLines, ...lines.slice(end)].join("\n");
  const preview = replacement.trim() ? filePreview(replacement, 6, 400) : { lines: 0, preview: "(حذف)" };
  return {
    ok: true,
    path: file.path,
    payload: { ok: true, path: file.path, replaced: { start, end, removed_lines: removed.length, inserted_lines: replacementLines.length } },
    message: `عدّل ${file.path} (سطور ${start}–${end}: ${removed.length}→${replacementLines.length})`,
    detail: { lines: replacementLines.length, preview: preview.preview },
    updated: { path: file.path, content: updated },
  };
}

/** multi_edit: دفعة تعديلات نصية حرفية على نفس الملف — ذرّية (كل نفس أو كله). */
export function runMultiEditTool(args: Record<string, unknown>, files: ProjectFile[]): ProjectToolResult {
  const rawPath = typeof args.path === "string" ? args.path : "";
  if (!rawPath.trim()) {
    return { ok: false, payload: { ok: false, error: "لازم تحدد path." }, message: "path فاضي" };
  }
  const edits = Array.isArray(args.edits) ? (args.edits as unknown[]) : [];
  if (edits.length === 0) {
    return { ok: false, path: rawPath, payload: { ok: false, error: "القايمة edits فاضية." }, message: "edits فاضية" };
  }
  if (edits.length > MAX_MULTI_EDIT_EDITS) {
    return {
      ok: false,
      path: rawPath,
      payload: { ok: false, error: `الحد ${MAX_MULTI_EDIT_EDITS} تعديلات في النداء الواحد — قسّمها على نداءين.` },
      message: "تعديلات كتيرة",
    };
  }
  const file = findFile(files, rawPath);
  if (!file) {
    return {
      ok: false,
      path: rawPath,
      payload: { ok: false, error: "الملف " + rawPath + " مش موجود في ملفات المشروع." },
      message: "الملف مش موجود",
    };
  }
  let content = file.content.replace(/\r\n?/g, "\n");
  const oldLines = content.split("\n").length;
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i] as Record<string, unknown> | null;
    const oldStr = e && typeof e.old_string === "string" ? e.old_string : null;
    const newStr = e && typeof e.new_string === "string" ? e.new_string : "";
    if (!oldStr) {
      return {
        ok: false,
        path: file.path,
        payload: { ok: false, error: `التعديل رقم ${i + 1} ناقص old_string — مفيش حاجة اتعدلت (ذرّية).` },
        message: "تعديل تالف",
      };
    }
    const n = content.split(oldStr).length - 1;
    if (n === 0) {
      return {
        ok: false,
        path: file.path,
        payload: {
          ok: false,
          error: `التعديل رقم ${i + 1}: النص القديم مش موجود حرفيًا — مفيش حاجة اتعدلت (ذرّية).`,
          hint: "اقرأ الملف بالجزء اللي فشل بـ read_file وانسخ النص حرفيًا، أو شغّل الباقي.",
        },
        message: "لا تطابق",
      };
    }
    if (n > 1) {
      return {
        ok: false,
        path: file.path,
        payload: { ok: false, error: `التعديل رقم ${i + 1}: النص القديم مكرر ${n} مرات — لازم يكون فريدًا. مفيش حاجة اتعدلت (ذرّية).` },
        message: "نص مكرر",
      };
    }
    content = content.replace(oldStr, newStr);
  }
  const newLines = content.split("\n").length;
  const delta = newLines - oldLines;
  const preview = filePreview(content, 6, 400);
  return {
    ok: true,
    path: file.path,
    payload: { ok: true, path: file.path, applied: edits.length, ...(delta !== 0 ? { line_delta: delta } : {}) },
    message: `${edits.length} تعديلات في ${file.path}${delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta} سطر)` : ""}`,
    detail: { lines: edits.length, preview: preview.preview },
    updated: { path: file.path, content },
  };
}

// ---------------------------------------------------------------------------
// تنفيذ read_skill / read_skill_file (مهارات المستخدم المحلية)
// القاعدة: المهارات بتوصل كحمولة مؤقتة مع الطلب (مش متخزنة) — الدوال دي بتقرا
// من الذاكرة الحية للريكوست وبس. لو مفيش مهارات، الأداة نفسها مش بتتبعت أصلًا.
// ---------------------------------------------------------------------------

function findSkill(skills: IncomingSkill[], wanted: string): IncomingSkill | null {
  const w = wanted.trim().toLowerCase();
  if (!w) return null;
  const exact = skills.find((s) => s.name.toLowerCase() === w);
  if (exact) return exact;
  const partial = skills.filter((s) => s.name.toLowerCase().includes(w) || w.includes(s.name.toLowerCase()));
  return partial.length === 1 ? partial[0] : null;
}

/** read_skill: بيرجّع النص الكامل للـSKILL.md بتاع المهارة. */
export function runReadSkillTool(
  args: Record<string, unknown>,
  skills: IncomingSkill[]
): { ok: boolean; path?: string; message?: string; detail?: { lines?: number; preview?: string }; payload: Record<string, unknown> } {
  const wanted = typeof args.name === "string" ? args.name : "";
  if (!wanted.trim()) {
    return { ok: false, payload: { ok: false, error: "لازم تحدد name (اسم المهارة زي ما ظهر في القايمة)." }, message: "name فاضي" };
  }
  const skill = findSkill(skills, wanted);
  if (!skill) {
    return {
      ok: false,
      path: wanted,
      payload: {
        ok: false,
        error: `مفيش مهارة باسم "${wanted}" بين المهارات الفعّالة.`,
        available: skills.map((s) => s.name),
        hint: "استخدم الاسم بالظبط زي ما ظهر في قايمة المهارات المحلية في السياق.",
      },
      message: "المهارة مش موجودة",
    };
  }
  const body = skill.body;
  const chunk = body.slice(0, 16_000);
  return {
    ok: true,
    path: skill.name,
    message: body.length > chunk.length ? `${skill.name} (مقتطعة لـ16 ألف حرف)` : skill.name,
    detail: { lines: body.split("\n").length, preview: body.slice(0, 500) },
    payload: {
      ok: true,
      name: skill.name,
      description: skill.description,
      content: chunk,
      ...(body.length > chunk.length ? { note: "المهارة طويلة — اتعرض أول 16 ألف حرف، وكمّل القراءة لو محتاج." } : {}),
      ...(skill.files.length > 0
        ? { extra_files: skill.files.map((f) => f.path), note2: "لأي ملف منهم استدعي read_skill_file بالاسم والمسار." }
        : {}),
    },
  };
}

export const INSTALL_SKILL_TOOL = {
  type: "function",
  function: {
    name: "install_skill",
    description:
      "نزّل مهارة (skill) جديدة من لينك إنترنت وثبّتها في مكتبة المستخدم المحلية (على جهازه) وطبّقها في نفس الرد. " +
      "استدعيها أول ما المستخدم يبعت لينك مهارة ويطلب تثبيتها: مستودع أو مجلد GitHub " +
      "(github.com/owner/repo أو github.com/owner/repo/tree/branch/dir)، أو لينك raw لملف SKILL.md، " +
      "أو لينك ملف .zip جاهز. بعد التثبيت بترجعلك تعليمات المهارة نفسها — اتبعها فورًا في الرد ده.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "لينك المهارة. مثال: github.com/anthropics/skills/tree/main/artifacts-builder",
        },
      },
      required: ["url"],
    },
  },
} as const;

// ---------------------------------------------------------------------------
// تنفيذ install_skill: ملفات المهارة بتتجمع لحظيًا من الإنترنت للذاكرة الحية
// بتاعة الريكوست — مفيش أي تخزين على السيرفر. الحمولة النهائية بتتبعت للعميل
// (SSE) لحفظها في IndexedDB، وتعليمات المهارة بترجع للموديل كنتيجة الأداة.
// لينكات: مستودع/مجلد/ملف GitHub، raw.githubusercontent.com، أو ملف .zip.
// ---------------------------------------------------------------------------

const INSTALL_MAX_FILES = MAX_SKILL_FILES;
const INSTALL_MAX_FILE_CHARS = MAX_SKILL_FILE_CHARS;
const INSTALL_MAX_TOTAL_CHARS = MAX_SKILLS_PAYLOAD_TOTAL_CHARS;
const INSTALL_FETCH_TIMEOUT_MS = 45_000;
const INSTALL_RAW_PREVIEW_CHARS = 14_000;

const INSTALL_SKILL_ARCHIVE_RE = /.zip(\?|$)/i;

const INSTALL_SKIP_PATH_RE = /(^|\/)(node_modules|\.git|\.next|dist|build|__pycache__|\.venv|venv|coverage)(\/|$)/;

function installFetch(url: string, init?: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), INSTALL_FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal: ac.signal, redirect: "follow" }).finally(() => clearTimeout(timer));
}

/**
 * حاجز SSRF عملي: https بس، نطاقات داخلية/محلية/عناوين IP خاصة ممنوعة،
 * ولينك IP أصلًا ممنوع — الأداة دي مفتوحة للموديل فالحد ده لازم.
 */
function safeHttpsUrl(raw: string): URL | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || !host.includes(".")) return null; // localhost أو أسماء داخلية
  if (host.endsWith(".internal") || host.endsWith(".local")) return null;
  if (/^(127|10)\./.test(host)) return null;
  if (/^192\.168\./.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
  if (/^169\.254\./.test(host)) return null;
  if (u.username || u.password) return null;
  return u;
}

/** بيتأكد إن الرد نصي وصالح ويوحّد نهايات الأسطر — بيرجع null مع أي حاجة نصها مش نص. */
async function fetchTextFile(res: Response): Promise<string | null> {
  if (!res.ok) return null;
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.startsWith("image/") || ct.startsWith("video/") || ct.startsWith("audio/") || ct.includes("font") || /zip|octet-stream|gzip|pdf/.test(ct)) return null;
  const text = await res.text();
  if (!text || text.length > INSTALL_MAX_FILE_CHARS) return null;
  return text.replace(/\r\n?/g, "\n");
}

/** بيترتيب المداخل: SKILL.md أولوية، وأقرب للمجذّر أعمق الأولوية للملفات. */
function orderEntries(entries: { path: string; text: string }[]): { path: string; text: string }[] {
  const isSkill = (s: { path: string }) => /(^|\/)SKILL\.md$/i.test(s.path);
  return [...entries].sort((a, b) => {
    if (isSkill(a) && !isSkill(b)) return -1;
    if (!isSkill(a) && isSkill(b)) return 1;
    return a.path.split("/").length - b.path.split("/").length;
  });
}

/** بيحوّل مداخل مجلدة لنسخة IncomingSkill جاهزة للتخزين/العرض. */
function skillFromEntries(entries: { path: string; text: string }[]): {
  skill: { name: string; description: string; body: string; files: { path: string; content: string }[] } | null;
} {
  const sorted = orderEntries(entries);
  const main = sorted[0];
  if (!main) return { skill: null };
  const fm = parseSkillFrontmatter(main.text);
  const body = (fm.body || main.text).trim().slice(0, MAX_SKILL_BODY_CHARS);
  if (!body.trim()) return { skill: null };
  const stem = (main.path.split("/").pop() || "skill").replace(/\.mdx?$/i, "").replace(/[^A-Za-z0-9\u0600-\u06FF_-]+/g, "-").slice(0, 56);
  const name = (fm.name || stem || "skill").trim().slice(0, MAX_SKILL_NAME_CHARS);
  const description = (fm.description || fallbackDescription(body)).trim().slice(0, MAX_SKILL_DESC_CHARS);
  const files: { path: string; content: string }[] = [];
  let total = body.length;
  for (const e of sorted.slice(1)) {
    if (files.length >= INSTALL_MAX_FILES) break;
    const content = e.text.trim().slice(0, INSTALL_MAX_FILE_CHARS);
    if (!content) continue;
    total += content.length;
    if (total > INSTALL_MAX_TOTAL_CHARS) break;
    files.push({ path: e.path, content });
  }
  return { skill: { name, description, body, files } };
}

/** بيقدّر يجيب شجرة المستودع بمرجع Git؛ بيرجع مسارات الـblobs فقط. */
async function ghTree(owner: string, repo: string, ref: string) {
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "MALG-web-ai" };
  try {
    const res = await installFetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`, { headers });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { tree?: { path: string; type: string }[] } | null;
    return j?.tree?.filter((t) => t.type === "blob" && typeof t.path === "string") ?? null;
  } catch {
    return null;
  }
}

/** بيحلّ مرجع GitHub فعلًا (اللي جوه اللينك / HEAD / main / master / default_branch). */
async function resolveGhRef(owner: string, repo: string, refFromUrl?: string): Promise<string> {
  const candidates = [refFromUrl, "HEAD", "main", "master"].filter(Boolean) as string[];
  for (const c of candidates) {
    const tree = await ghTree(owner, repo, c);
    if (tree && tree.length > 0) return c;
  }
  try {
    const res = await installFetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "MALG-web-ai" },
    });
    if (res.ok) {
      const j = (await res.json()) as { default_branch?: string };
      if (j?.default_branch) return j.default_branch;
    }
  } catch {}
  return refFromUrl || "main";
}

interface InstallCollected {
  entries: { path: string; text: string }[];
  skippedBinary: number;
}

/** بيضيف مدخل نصي صالح — بيسكّط الثنائي/المسارات الغلطة/عن الحدود. */
function addInstallEntry(c: InstallCollected, rawPath: string, text: string): void {
  const p = sanitizeSkillPath(rawPath);
  if (!p || INSTALL_SKIP_PATH_RE.test(p)) return;
  if (!isTextSkillFile(p)) {
    c.skippedBinary += 1;
    return;
  }
  const t = text.slice(0, INSTALL_MAX_FILE_CHARS);
  if (!t.trim()) return;
  if (c.entries.some((e) => e.path === p)) return;
  const total = c.entries.reduce((n, e) => n + e.text.length, 0);
  if (total + t.length > INSTALL_MAX_TOTAL_CHARS) {
    c.skippedBinary += 1;
    return;
  }
  c.entries.push({ path: p, text: t });
}

/**
 * بيلوك مجلد المهارة من شجرة GitHub: بيختر SKILL.md داخل المجلد، وبنجيب
 * الملفات الإضافية الموجودة في نفس المجلد بس (استخدامه العملي للمهارات).
 */
async function collectGhFolder(owner: string, repo: string, ref: string, baseDir: string): Promise<InstallCollected> {
  const c: InstallCollected = { entries: [], skippedBinary: 0 };
  const tree = await ghTree(owner, repo, ref);
  if (!tree) return c;
  const base = baseDir ? `${baseDir.replace(/\/+$/, "")}/` : "";
  const candidates = tree
    .map((t) => t.path)
    .filter((p) => /(^|\/)SKILL\.md$/i.test(p) && (!base || p.startsWith(base)) && !INSTALL_SKIP_PATH_RE.test(p))
    .sort((a, b) => a.split("/").length - b.split("/").length);
  const skillMd = candidates[0];
  if (!skillMd) return c;
  const skillBase = skillMd.includes("/") ? skillMd.slice(0, skillMd.lastIndexOf("/") + 1) : "";
  let mainText: string | null = null;
  try {
    const res = await installFetch(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${skillMd.split("/").map(encodeURI).join("/")}`, { headers: { "User-Agent": "MALG-web-ai" } });
    mainText = await fetchTextFile(res);
  } catch {}
  if (!mainText) return c;
  addInstallEntry(c, skillBase ? skillMd.slice(skillBase.length) : skillMd, mainText);
  const wanted = tree
    .map((t) => t.path)
    .filter((p) => p !== skillMd && p.startsWith(skillBase) && !p.endsWith("/") && p.length <= 200 && p === encodeURI(p))
    .sort((a, b) => a.localeCompare(b));
  for (const p of wanted.slice(0, INSTALL_MAX_FILES)) {
    try {
      const res = await installFetch(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`, { headers: { "User-Agent": "MALG-web-ai" } });
      const text = await fetchTextFile(res);
      if (text) addInstallEntry(c, p.slice(skillBase.length), text);
    } catch {}
  }
  return c;
}

/** بيلوك أرشيف ZIP من اللينك — نفس قواعد الاستيراد المحلي (كبسولوجيا ملفات نصية). */
async function collectZipUrl(url: URL): Promise<InstallCollected> {
  const c: InstallCollected = { entries: [], skippedBinary: 0 };
  let bytes: ArrayBuffer;
  try {
    const res = await installFetch(url.toString(), { headers: { "User-Agent": "MALG-web-ai" } });
    if (!res.ok) return c;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 12 * 1024 * 1024) return c;
    bytes = buf;
  } catch {
    return c;
  }
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const listed = Object.values(zip.files).filter((e) => !e.dir);
  const names = listed.map((e) => e.name);
  // wrapper واحد أعلى المستوى (skill-name/SKILL.md) بنكشفه ونستبعد prefix بس — زي مجلد الاستيراد.
  const tops = new Set(names.map((n) => n.split("/")[0] || ""));
  const skillRoots = [...tops].filter((t) => t && names.some((n) => n.startsWith(`${t}/`) && /(^|\/)SKILL\.md$/i.test(n)));
  const strip = skillRoots.length === 1 && listed.length > 1 ? `${skillRoots[0]}/` : "";
  for (const e of listed) {
    const name = strip && e.name.startsWith(strip) ? e.name.slice(strip.length) : e.name;
    try {
      const text = await e.async("string");
      addInstallEntry(c, name, text);
    } catch {
      c.skippedBinary += 1;
    }
  }
  return c;
}

/** اللينك ملف مفرد (raw أو gist أو أي نصي) — بيتقبل لو فيه محتوى الخ. */
async function collectSingleFile(url: URL): Promise<InstallCollected> {
  const c: InstallCollected = { entries: [], skippedBinary: 0 };
  const fname = url.pathname.split("/").filter(Boolean).pop() || "SKILL.md";
  try {
    const res = await installFetch(url.toString(), { headers: { "User-Agent": "MALG-web-ai" } });
    const text = await fetchTextFile(res);
    if (text) addInstallEntry(c, fname, text);
  } catch {}
  return c;
}

/** بيفكك لينك GitHub: مستودع (root) أو مجلد (tree) أو ملف (blob). */
interface GhRef {
  owner: string;
  repo: string;
  ref?: string;
  /** المسار بعد المرجع: المجلد في tree أو الملف في blob، والغايب في root */
  path: string;
  mode: "root" | "tree" | "blob";
}

function parseGithubUrl(u: URL): GhRef | null {
  if (u.hostname.toLowerCase() !== "github.com") return null;
  const segs = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segs.length < 2) return null;
  const [owner, repoRaw, kind, ...rest] = segs;
  const repo = repoRaw.replace(/\.git$/i, "");
  if (kind && /^(pull|issues|watch|stargazers|network|forks|releases|wiki)$/i.test(kind)) return null;
  if (!kind) return { owner, repo, path: "", mode: "root" };
  if (rest.length === 0) return { owner, repo, path: "", mode: "root" };
  const [ref, ...tail] = rest;
  const path = tail.join("/");
  if (kind === "tree") return { owner, repo, ref, path, mode: "tree" };
  if (kind === "blob") return { owner, repo, ref, path, mode: "blob" };
  return null;
}

/** raw.githubusercontent.com/o/r/REF/path — بنفس فكّة blob (المرجع معلوم دايمًا). */
function parseRawUrl(u: URL): GhRef | null {
  if (u.hostname.toLowerCase() !== "raw.githubusercontent.com") return null;
  const segs = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segs.length < 4) return null;
  const [owner, repo, ref, ...file] = segs;
  return { owner, repo, ref, path: file.join("/"), mode: "blob" };
}

interface InstallOutcome {
  ok: boolean;
  path?: string;
  message?: string;
  detail?: { lines?: number; preview?: string };
  payload: Record<string, unknown>;
  /** المهارة الناجحة — السيرفر بيدفعها للعميل (skill_saved) وبحفظها في ذاكرة الريكوست. */
  skill?: { name: string; description: string; body: string; files: { path: string; content: string }[] };
}

/** install_skill: بجيب ملفات المهارة دلوقتي وبترجعها للسيرفر والموديل مع بعض. */
export async function runInstallSkillTool(args: Record<string, unknown>): Promise<InstallOutcome> {
  const rawUrl = typeof args.url === "string" ? args.url.trim() : "";
  if (!rawUrl) {
    return { ok: false, payload: { ok: false, error: "لازم تحدد url — لينك المهارة (GitHub/zip/raw)." }, message: "url فاضي" };
  }
  const url = safeHttpsUrl(rawUrl);
  if (!url) {
    return {
      ok: false,
      path: rawUrl,
      payload: {
        ok: false,
        error: "اللينك مش متاح: لازم يكون https عام (مش شبكة داخلية ولا IP محلي).",
        hint: "استخدم لينك مستودع/مجلد GitHub أو raw.githubusercontent.com أو لينك .zip جاهز.",
      },
      message: "لينك مش مسموح",
    };
  }

  const gh = parseGithubUrl(url) ?? parseRawUrl(url);
  let collected: InstallCollected;
  let originLabel: string;
  let shownPath: string;

  if (gh) {
    originLabel = `github.com/${gh.owner}/${gh.repo}`;
    shownPath = gh.path || "";
    const ref = await resolveGhRef(gh.owner, gh.repo, gh.ref);
    let baseDir = "";
    if (gh.mode === "tree") baseDir = gh.path.replace(/\/+$/, "");
    else if (gh.mode === "blob") baseDir = /SKILL\.md$/i.test(gh.path) && gh.path.includes("/") ? gh.path.slice(0, gh.path.lastIndexOf("/")) : gh.path.split("/").slice(0, -1).join("/");
    collected = await collectGhFolder(gh.owner, gh.repo, ref, baseDir);
  } else if (INSTALL_SKILL_ARCHIVE_RE.test(url.pathname)) {
    originLabel = url.hostname;
    shownPath = url.pathname.split("/").filter(Boolean).pop() || url.hostname;
    collected = await collectZipUrl(url);
  } else {
    originLabel = url.hostname;
    shownPath = url.pathname.split("/").filter(Boolean).pop() || url.hostname;
    collected = await collectSingleFile(url);
  }

  if (collected.entries.length === 0) {
    return {
      ok: false,
      path: rawUrl,
      payload: {
        ok: false,
        error: "ما لقيتش مهارة (SKILL.md) عند اللينك ده أو اللينك مش شغال.",
        ...(collected.skippedBinary > 0 ? { note: `اتسقّط ${collected.skippedBinary} ملف ثنائي/كبير.` } : {}),
        hint: "اتأكد إن اللينك عام وفيه SKILL.md — أو المستخدم يعمل تثبيت يدوي من تاب «المهارات» في الإعدادات.",
      },
      message: "مفيش مهارة هنا",
    };
  }

  const { skill } = skillFromEntries(collected.entries);
  if (!skill) {
    return {
      ok: false,
      path: rawUrl,
      payload: { ok: false, error: "محتوى المهارة فاضي أو مش صالح للقراءة كنص مهارة." },
      message: "مهارة فاضية",
    };
  }

  return {
    ok: true,
    path: skill.name,
    message: `${skill.name} — ${collected.entries.length} ملف${shownPath ? ` (${shownPath})` : ""}`,
    detail: { lines: skill.body.split("\n").length, preview: skill.body.slice(0, 500) },
    skill,
    payload: {
      ok: true,
      name: skill.name,
      description: skill.description,
      origin: originLabel,
      saved_files: skill.files.length,
      content: skill.body.slice(0, INSTALL_RAW_PREVIEW_CHARS),
      ...(skill.body.length > INSTALL_RAW_PREVIEW_CHARS ? { note: "النص شامل محفوظ عند المستخدم — ده مقتطف للقراءة." } : {}),
      ...(skill.files.length > 0 ? { extra_files: skill.files.map((f) => f.path) } : {}),
      result: `تم تثبيت "${skill.name}" في مكتبة المستخدم المحلية (على جهازه فقط). اتبع تعليمات المهارة في الرد ده فورًا، واقرا أي ملف إضافي بـ read_skill_file لو لزم. ما تكرّرش التثبيت لنفس اللينك.`,
    },
  };
}

/** read_skill_file: بيرجّع ملف إضافي سكربت/قالب جوه المهارة. */
export function runReadSkillFileTool(
  args: Record<string, unknown>,
  skills: IncomingSkill[]
): { ok: boolean; path?: string; message?: string; detail?: { lines?: number; preview?: string }; payload: Record<string, unknown> } {
  const wantedName = typeof args.name === "string" ? args.name : "";
  const wantedPath = typeof args.path === "string" ? args.path : "";
  if (!wantedName.trim() || !wantedPath.trim()) {
    return { ok: false, payload: { ok: false, error: "لازم name (المهارة) و path (الملف جواها)." }, message: "معاملات ناقصة" };
  }
  const skill = findSkill(skills, wantedName);
  if (!skill) {
    return {
      ok: false,
      path: wantedName,
      payload: { ok: false, error: `مفيش مهارة باسم "${wantedName}".`, available: skills.map((s) => s.name) },
      message: "المهارة مش موجودة",
    };
  }
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\.?\//, "").trim().toLowerCase();
  const w = norm(wantedPath);
  const file = skill.files.find((f) => norm(f.path) === w) ?? skill.files.find((f) => norm(f.path).endsWith("/" + w));
  if (!file) {
    return {
      ok: false,
      path: skill.name,
      payload: {
        ok: false,
        error: `الملف "${wantedPath}" مش موجود في المهارة ${skill.name}.`,
        available: skill.files.map((f) => f.path),
      },
      message: "الملف مش موجود",
    };
  }
  const chunk = file.content.slice(0, 16_000);
  return {
    ok: true,
    path: `${skill.name}/${file.path}`,
    message: file.content.length > chunk.length ? `${file.path} (مقتطعة)` : file.path,
    detail: { lines: file.content.split("\n").length, preview: file.content.slice(0, 500) },
    payload: {
      ok: true,
      name: skill.name,
      path: file.path,
      content: chunk,
      ...(file.content.length > chunk.length ? { note: "اتعرض أول 16 ألف حرف بس." } : {}),
    },
  };
}
