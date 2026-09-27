/**
 * تعريف أداة "تشغيل أمر حقيقي" (function calling بصيغة OpenAI) اللي بنبعتها
 * للموديل لما فيه sandbox متظبط (E2B_API_KEY موجود). لو الموديل قرر يستخدمها،
 * إحنا فعليًا بننفذ الأمر في lib/sandbox.ts (مش بنرد عليه برسالة مصطنعة).
 */

import type { ProjectFile } from "./parseContent";
import { extractProjectFiles } from "./parseContent";
import { extractAgentStepsMeta } from "./agentEvents";
import type { AgentToolName } from "./agentEvents";
import { extractUserAttachmentFiles } from "./attachments";

export const RUN_COMMAND_TOOL = {
  type: "function",
  function: {
    name: "run_command",
    description:
      "شغّل أمر شل حقيقي (زي npm install, npm run build, npm test, python file.py, pytest ...) " +
      "جوه sandbox حقيقي معزول فيه أحدث نسخة من ملفات المشروع: الملفات اللي كتبتها إنت في نفس " +
      "المحادثة + أي ملفات رفعها المستخدم كمرفق (كود/نصوص/PDF مستخرج/zip اتفكّ) في أي رسالة منه. " +
      "استخدمها للتأكد إن الكود اللي كتبته شغال فعلاً قبل ما تقول للمستخدم إنه تمام — النتيجة " +
      "اللي هترجعلك (stdout/stderr/exit code) حقيقية 100% مش متخيّلة. متستخدمهاش لأي حاجة غير " +
      "التأكد من الكود (زي تشغيل أوامر خطيرة أو مالهاش لازمة بالمشروع).",
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

/** بيحدد اسم الأداة المناسب للعرض في Activity Block (run_tests لو الأمر بيبان إنه اختبارات). */
export function classifyCommandTool(command: string): AgentToolName {
  return /\btest|pytest|jest|vitest|phpunit|go test|rspec\b/i.test(command) ? "run_tests" : "run_command";
}

/**
 * بيجمّع أحدث نسخة من كل ملفات المشروع اللي المفروض تكون موجودة في الـ
 * sandbox — من مصدرين: (1) الملفات اللي الموديل كتبها في ردوده القديمة +
 * الرد الحالي (لسه بيتبني)، و(2) الملفات اللي المستخدم نفسه رفعها كمرفقات
 * في أي رسالة من رسايله. بنمشي على الرسايل بالترتيب الزمني (زي ما هي في
 * الداتابيز) فلو الموديل عدّل ملف رفعه المستخدم، نسخة الموديل الأحدث هي
 * اللي بتكسب — وآخر حاجة بتتطبق هي كتابات الموديل في الرد الحالي نفسه.
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
