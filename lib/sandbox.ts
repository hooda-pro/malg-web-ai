/**
 * تنفيذ أوامر حقيقي جوه sandbox حقيقي ومعزول (E2B) — مش محاكاة ومش مخرجات
 * متخيّلة من الموديل. الأمر بيتنفذ فعليًا على جهاز معزول مؤقت، وبيترجع
 * stdout/stderr/exit code حقيقيين بالظبط زي ما هما.
 *
 * محتاج متغير بيئة E2B_API_KEY (سجّل مجانًا على https://e2b.dev واخد مفتاح
 * من الـ dashboard). من غيره، الميزة بتتعطل بنظافة (الموديل ميقدرش يستخدم
 * أداة run_command أصلاً — شوف lib/agentTools.ts) بدل ما تفضل موجودة وتفشل
 * بصمت أو تدّي نتايج وهمية.
 */

import { Sandbox, CommandExitError } from "e2b";

export interface SandboxFile {
  path: string;
  content: string;
}

export interface RunCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  /** true لو الأمر اتقطع لأنه خد وقت أطول من المسموح */
  timedOut: boolean;
  /** رسالة عربية جاهزة للعرض لو حصلت مشكلة قبل/أثناء التنفيذ (مش خطأ الأمر نفسه) */
  error?: string;
}

// حد أقصى معقول لكل تنفيذ أمر واحد — كافي لـ npm install / build / test لمشروع
// صغير-متوسط من غير ما يسيب طلب الشات معلّق لوقت طويل جداً.
const COMMAND_TIMEOUT_MS = 90_000;
// عمر الـ sandbox نفسه (بيتقفل تلقائيًا بعده لو نسينا نقفله يدويًا لأي سبب).
const SANDBOX_LIFETIME_MS = 3 * 60_000;
// سقف حجم كل ملف بيتكتب في الـ sandbox — حماية من مشروع ضخم غير واقعي.
const MAX_FILE_BYTES = 400_000;
const MAX_FILES = 60;
const MAX_OUTPUT_CHARS = 6_000;

export function isSandboxConfigured(): boolean {
  return !!(process.env.E2B_API_KEY || "").trim();
}

function sanitizeRelativePath(path: string): string | null {
  const cleaned = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = cleaned.split("/").filter((s) => s && s !== ".");
  if (segments.some((s) => s === "..")) return null; // ممنوع الخروج بره مجلد المشروع
  const joined = segments.join("/");
  return joined || null;
}

/**
 * بيجهّز sandbox جديد، يكتب فيه ملفات المشروع الحقيقية اللي اتكتبت في نفس
 * المحادثة لحد دلوقتي، بعدين يشغّل الأمر المطلوب فعليًا جوه مجلد المشروع،
 * وبيقفل الـ sandbox في الآخر مهما كانت النتيجة (نجاح أو فشل أو exception).
 */
export async function runInSandbox(
  files: SandboxFile[],
  command: string
): Promise<RunCommandResult> {
  if (!isSandboxConfigured()) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      error: "مفيش sandbox متظبط على السيرفر دلوقتي، فالأمر ده مش هيتنفذ فعليًا.",
    };
  }

  const trimmedCommand = command.trim().slice(0, 2000);
  if (!trimmedCommand) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      error: "الأمر فاضي.",
    };
  }

  let sbx: Sandbox | null = null;
  try {
    sbx = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: SANDBOX_LIFETIME_MS,
    });

    const projectDir = "/home/user/project";
    await sbx.commands.run(`mkdir -p ${projectDir}`);

    let written = 0;
    for (const f of files) {
      if (written >= MAX_FILES) break;
      const safePath = sanitizeRelativePath(f.path);
      if (!safePath) continue;
      const content = f.content.length > MAX_FILE_BYTES ? f.content.slice(0, MAX_FILE_BYTES) : f.content;
      await sbx.files.write(`${projectDir}/${safePath}`, content);
      written += 1;
    }

    const result = await sbx.commands.run(trimmedCommand, {
      cwd: projectDir,
      timeoutMs: COMMAND_TIMEOUT_MS,
    });

    return {
      ok: result.exitCode === 0,
      stdout: (result.stdout || "").slice(0, MAX_OUTPUT_CHARS),
      stderr: (result.stderr || "").slice(0, MAX_OUTPUT_CHARS),
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      timedOut: false,
    };
  } catch (e) {
    // مهم جدًا: E2B بيعمل throw لـ CommandExitError (مش بيرجّع نتيجة عادية)
    // لما الأمر يخلص بـ exit code مش صفر — وده أمر طبيعي وشائع جدًا (زي أمر
    // بيدور على ملف مش موجود، أو أداة رجّعت "مفيش نتايج"). من غير المعالجة
    // دي، كنا بنضيع stdout/stderr الحقيقيين ونرجّع رسالة عامة "الأمر مانفذش"
    // كأنه كراش فعلي في الـ sandbox نفسه — بينما هو مجرد فشل عادي للأمر، والموديل
    // محتاج يشوف الـ stderr الحقيقي عشان يفهم السبب ويصلّح تلقائيًا.
    if (e instanceof CommandExitError) {
      return {
        ok: false,
        stdout: (e.stdout || "").slice(0, MAX_OUTPUT_CHARS),
        stderr: (e.stderr || "").slice(0, MAX_OUTPUT_CHARS),
        exitCode: typeof e.exitCode === "number" ? e.exitCode : null,
        timedOut: false,
      };
    }

    const message = e instanceof Error ? e.message : String(e);
    const timedOut = /timeout/i.test(message);
    console.error("[sandbox] run_command failed", message);
    return {
      ok: false,
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut,
      error: timedOut
        ? "الأمر خد وقت أطول من المسموح (90 ثانية) واتقطع."
        : "حصلت مشكلة حقيقية في الاتصال بالـ sandbox نفسه (مش في الأمر) — الأمر مانفذش خالص.",
    };
  } finally {
    if (sbx) {
      try {
        await sbx.kill();
      } catch {
        // تجاهل — الـ sandbox هيتقفل لوحده بعد timeoutMs على أي حال
      }
    }
  }
}
