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
  /** لو الأمر فشل بسبب ملف/مجلد مش موجود: المجلد الحالي ومحتواه، عشان الموديل يفهم مكانه بدل ما يخمّن. */
  hint?: string;
}

// حد أقصى لكل أمر واحد — افتراضي ~3 دقايق عشان يناسب نافذة Hobby (300 ثانية).
// (قابل للرفع عبر E2B_COMMAND_TIMEOUT_MS على خطة مدفوعة/VPS مع maxDuration أكبر).
// السقف الفعلي لكل رد بيتحكّم فيه SESSION_BUDGET_MS + maxDuration بتاع الـ route.
const COMMAND_TIMEOUT_MS =
  Number(process.env.E2B_COMMAND_TIMEOUT_MS) > 0
    ? Math.floor(Number(process.env.E2B_COMMAND_TIMEOUT_MS))
    : 170_000;
// عمر الـ sandbox نفسه (بيتقفل تلقائيًا بعده لو نسينا نقفله يدويًا لأي سبب).
// ساعة كاملة عشان يغطي مهمة طويلة (كل رد بيفتح جلسة خاصة بيه وبيقفلها في الآخر).
const SANDBOX_LIFETIME_MS =
  Number(process.env.E2B_LIFETIME_MS) > 0
    ? Math.floor(Number(process.env.E2B_LIFETIME_MS))
    : 60 * 60_000;
// مهلة إجمالية لكل أوامر الرد الواحد — بعدها منبدأش أمر جديد عشان الرد نفسه
// يلحق يخلص ويتحفظ بدل ما الـ route يتقطع في النص.
// مهم: العدّ بيبدأ من لحظة وصول الطلب (مش من لحظة فتح الـ sandbox) — قبل كده كان بيبدأ بعد أول
// نداء للموديل (ممكن ياخد دقيقة+)، فمجموع الوقت كان بيعدّي 300 ثانية والـ route بيتقتل
// من المنصة قبل ما يحفظ الرد، فالمستخدم يشوف الرد بيقطع ومفيش حاجة بتتحفظ.
// 180 ثانية بتملا نافذة Hobby (maxDuration=300) وتسيب ~100 ثانية
// لنداء الموديل الأخير (الخلاصة) والحفظ. المهمة اللي أطول من كده بتكمل تلقائيًا
// عبر التكملة التلقائية في الواجهة (كل تكملة نافذة جديدة).
// قابلة للرفع عبر E2B_SESSION_BUDGET_MS لخطة مدفوعة/VPS مع maxDuration أكبر.
export const SESSION_BUDGET_MS =
  Number(process.env.E2B_SESSION_BUDGET_MS) > 0
    ? Math.floor(Number(process.env.E2B_SESSION_BUDGET_MS))
    : 180_000;
// سقف حجم كل ملف بيتكتب في الـ sandbox — حماية من مشروع ضخم غير واقعي.
const MAX_FILE_BYTES = 400_000;
// كان 60 وده كان بيسيب ملفات ناقصة بصمت في أي مشروع أكبر من كده.
const MAX_FILES = 500;
const MAX_OUTPUT_CHARS = 6_000;
// كان 2000 حرف وده كان بيقص أي heredoc (cat > file << EOF) في النص فيطلع
// "here-document delimited by end-of-file". دلوقتي 20000.
export const MAX_COMMAND_CHARS = 20_000;

// الـ sandbox الافتراضي في E2B (template "base") = 2 vCPU و512 MiB رام، والرام بتتحدد وقت
// بناء الـ template مش وقت التشغيل. مشروع زي Next + React + firebase بيتقتل في
// `npm install` (exit 137 = OOM) على 512MB. الحل: نبني template أكبر (شوف
// e2b-template/README.md) ونحط اسمه/الـ id في E2B_TEMPLATE، ونقول للتطبيق حجم رامه
// الحقيقي في E2B_SANDBOX_MEMORY_MB عشان الموديل يعرف حدوده.
export function getSandboxTemplate(): string | undefined {
  const t = (process.env.E2B_TEMPLATE || "").trim();
  return t || undefined;
}

export function getSandboxMemoryMb(): number {
  const n = Number(process.env.E2B_SANDBOX_MEMORY_MB);
  return Number.isFinite(n) && n >= 128 ? Math.floor(n) : 512;
}

/** exit 137 = SIGKILL (غالبًا OOM killer)، 134 = SIGABRT (Node بيعمل abort لما الـ heap يخلص). */
export function looksLikeOutOfMemory(exitCode: number | null, stderr: string): boolean {
  if (exitCode === 137 || exitCode === 134) return true;
  return /\bKilled\b|JavaScript heap out of memory|FATAL ERROR: .*(heap|allocation)|Cannot allocate memory|ENOMEM/i.test(stderr);
}
export const PROJECT_DIR = "/home/user/project";

/** الشل نفسه رفض الأمر (قبل ما ينفذ أي حاجة) — زي `syntax error near unexpected token '('`. */
export function looksLikeShellSyntaxError(stderr: string): boolean {
  return /syntax error|unexpected token|unexpected EOF|unterminated|here-document delimited by end-of-file|unmatched/i.test(stderr);
}

export const SHELL_SYNTAX_HINT =
  "الشل رفض الأمر نفسه قبل ما ينفذ أي حاجة (خطأ syntax في كتابة الأمر، مش في المشروع). " +
  "السبب الأشهر: اسم أو مسار فيه أقواس أو مسافات أو رموز خاصة من غير تنصيص، زي Nothing_Phone_(3) — " +
  "لازم يتحط بين ' ' ('Nothing_Phone_(3)'). ما تعيدش نفس الأمر. " +
  "لو الأمر فيه حلقة for أو أكتر من سطرين، اكتبه كملف سكربت (بكتلة path=\"script.sh\" أو script.py) وشغّله بـ bash script.sh، " +
  "وما تستخدمش الـ shell أصلًا لجلب بيانات من الإنترنت لمجرد إنك تبني موقع — اكتب الملفات مباشرة.";

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

function isTimeoutMessage(message: string): boolean {
  return /timeout|timed out/i.test(message);
}

/**
 * جلسة sandbox واحدة لكل رد: بتتفتح مرة (lazy — أول أمر بس)، وكل أوامر الرد
 * بتشتغل جواها بالتتابع، وبتتقفل مرة واحدة في الآخر.
 *
 * ليه: قبل كده كل أمر كان بيفتح sandbox جديد ويكتب الملفات ويقتله. يعني
 * `npm install` في أمر و`npm run build` في اللي بعده كان لازم يفشل (node_modules
 * راحت)، وأي ملف الموديل يعدّله بالشل كان بيضيع، وكل أمر كان بيدفع تكلفة
 * إنشاء sandbox + كتابة كل الملفات من الأول.
 *
 * الملفات: بنكتب بس الملفات الجديدة/اللي اتغيّر محتواها من آخر مرة (مقارنة
 * بالنسخة اللي كتبناها إحنا)، فأي تعديل عمله الموديل بالشل على ملف ماتغيّرش
 * من ناحيتنا مبيتمسحش.
 */
export class SandboxSession {
  private sbx: Sandbox | null = null;
  private synced = new Map<string, string>();
  private readonly startedAt: number;
  private skippedFiles = 0;

  /** @param requestStartedAt وقت وصول الطلب (Date.now()) — الميزانية الزمنية بتتحسب منه. */
  constructor(requestStartedAt: number = Date.now()) {
    this.startedAt = requestStartedAt;
  }

  get skipped(): number {
    return this.skippedFiles;
  }

  private async ensure(): Promise<Sandbox> {
    if (this.sbx) return this.sbx;
    const template = getSandboxTemplate();
    const createOpts = { apiKey: process.env.E2B_API_KEY, timeoutMs: SANDBOX_LIFETIME_MS };
    const sbx = template ? await Sandbox.create(template, createOpts) : await Sandbox.create(createOpts);
    await sbx.commands.run(`mkdir -p ${PROJECT_DIR}`);
    this.sbx = sbx;
    return sbx;
  }

  private async sync(sbx: Sandbox, files: SandboxFile[]): Promise<void> {
    const pending: { path: string; content: string }[] = [];
    let counted = this.synced.size;
    this.skippedFiles = 0;

    for (const f of files) {
      const safePath = sanitizeRelativePath(f.path);
      if (!safePath) continue;
      const content = f.content.length > MAX_FILE_BYTES ? f.content.slice(0, MAX_FILE_BYTES) : f.content;
      if (this.synced.get(safePath) === content) continue;
      if (!this.synced.has(safePath)) {
        if (counted >= MAX_FILES) {
          this.skippedFiles++;
          continue;
        }
        counted++;
      }
      pending.push({ path: safePath, content });
    }

    // كتابة على دفعات متوازية صغيرة (أسرع من واحد ورا واحد من غير ما نضغط الـ API).
    const BATCH = 8;
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      await Promise.all(batch.map((f) => sbx.files.write(`${PROJECT_DIR}/${f.path}`, f.content)));
      for (const f of batch) this.synced.set(f.path, f.content);
    }
  }

  /** بينفذ أمر واحد جوه الجلسة (بيفتحها لو لسه). ما بيرميش exception أبدًا. */
  async run(files: SandboxFile[], command: string): Promise<RunCommandResult> {
    if (!isSandboxConfigured()) {
      return {
        ok: false, stdout: "", stderr: "", exitCode: null, timedOut: false,
        error: "مفيش sandbox متظبط على السيرفر دلوقتي، فالأمر ده مش هيتنفذ فعليًا.",
      };
    }

    const cmd = command.trim();
    if (!cmd) {
      return { ok: false, stdout: "", stderr: "", exitCode: null, timedOut: false, error: "الأمر فاضي." };
    }
    if (cmd.length > MAX_COMMAND_CHARS) {
      return {
        ok: false, stdout: "", stderr: "", exitCode: null, timedOut: false,
        error: `الأمر أطول من ${MAX_COMMAND_CHARS.toLocaleString("en-US")} حرف فمانفذش (عشان مايتقصش في النص). اكتب الملفات الكبيرة بكتلة ملف عادية (path="...") مش بـ heredoc، وقسّم الأمر.`,
      };
    }

    const elapsed = Date.now() - this.startedAt;
    if (elapsed > SESSION_BUDGET_MS) {
      return {
        ok: false, stdout: "", stderr: "", exitCode: null, timedOut: true,
        error: "خلصت المهلة الإجمالية للأوامر في الرد ده (حوالي 3 دقايق) — الأمر مانفذش. لخّص للمستخدم اللي اتعمل واللي لسه ناقص.",
      };
    }

    try {
      const sbx = await this.ensure();
      await this.sync(sbx, files);

      const remaining = Math.max(SESSION_BUDGET_MS + 30_000 - elapsed, 20_000);
      const timeoutMs = Math.min(COMMAND_TIMEOUT_MS, remaining);
      const result = await sbx.commands.run(cmd, { cwd: PROJECT_DIR, timeoutMs });

      const out: RunCommandResult = {
        ok: result.exitCode === 0,
        stdout: (result.stdout || "").slice(0, MAX_OUTPUT_CHARS),
        stderr: (result.stderr || "").slice(0, MAX_OUTPUT_CHARS),
        exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
        timedOut: false,
      };
      return out;
    } catch (e) {
      // E2B بيعمل throw لـ CommandExitError لما الأمر يخلص بـ exit code مش صفر —
      // ده فشل عادي للأمر (مش كراش)، والموديل محتاج الـ stderr الحقيقي.
      if (e instanceof CommandExitError) {
        const stderr = (e.stderr || "").slice(0, MAX_OUTPUT_CHARS);
        const result: RunCommandResult = {
          ok: false,
          stdout: (e.stdout || "").slice(0, MAX_OUTPUT_CHARS),
          stderr,
          exitCode: typeof e.exitCode === "number" ? e.exitCode : null,
          timedOut: false,
        };
        if (looksLikeOutOfMemory(result.exitCode, stderr)) {
          result.hint = await this.memoryHint(result.exitCode);
        } else if (looksLikeShellSyntaxError(stderr)) {
          result.hint = SHELL_SYNTAX_HINT;
        } else if (/No such file or directory|ENOENT|cannot find|not found/i.test(stderr)) {
          result.hint = await this.locationHint();
        }
        return result;
      }

      const message = e instanceof Error ? e.message : String(e);
      const timedOut = isTimeoutMessage(message);
      console.error("[sandbox] run_command failed", message);
      return {
        ok: false, stdout: "", stderr: "", exitCode: null, timedOut,
        error: timedOut
          ? "الأمر خد وقت أطول من المسموح واتقطع."
          : "حصلت مشكلة حقيقية في الاتصال بالـ sandbox نفسه (مش في الأمر) — الأمر مانفذش خالص.",
      };
    }
  }

  /** المجلد الحالي + محتواه (أول مستوى) — بيتبعت للموديل لما أمر يفشل بـ "No such file". */
  private async locationHint(): Promise<string | undefined> {
    if (!this.sbx) return undefined;
    try {
      const r = await this.sbx.commands.run("pwd; ls -1A | head -40", { cwd: PROJECT_DIR, timeoutMs: 10_000 });
      return `الأمر بيشتغل جوه مجلد المشروع مباشرة (ماتعملش cd project). المجلد الحالي والمحتوى:\n${(r.stdout || "").trim()}`;
    } catch {
      return undefined;
    }
  }

  /**
   * لما أمر يتقتل بسبب الرام: بنرجّع للموديل حجم الرام الحقيقي (free -m) وتعليمات واضحة،
   * عشان ميكررش نفس الأمر ولا يرفع --max-old-space-size فوق الرام الفعلية (ده بيخلّي
   * الـ OOM killer يقتل العملية بدل ما الـ GC يشتغل).
   */
  private async memoryHint(exitCode: number | null): Promise<string> {
    let free = "";
    if (this.sbx) {
      try {
        const r = await this.sbx.commands.run("free -m | head -3", { cwd: PROJECT_DIR, timeoutMs: 10_000 });
        free = (r.stdout || "").trim();
      } catch {
        // تجاهل
      }
    }
    return (
      `الأمر اتقتل بسبب نفاد الرام (exit ${exitCode ?? "?"}). رام الـ sandbox حوالي ${getSandboxMemoryMb()}MB. ` +
      `ما تعيدش نفس الأمر ولا ترفع --max-old-space-size فوق الرام الفعلية. ` +
      `لو التثبيت/البناء الكامل مش هينفع على الرام دي، قول للمستخدم كده بصراحة (ومتقولش إن المشروع اشتغل) ` +
      `وتحقق بطرق أخف: tsc على ملفات محددة بعد تثبيت typescript بس، أو node --check لملفات JS، أو اختبار دوال منفصلة.` +
      (free ? `\n${free}` : "")
    );
  }

  /** بيقفل الـ sandbox — آمن يتنادى أكتر من مرة. */
  async close(): Promise<void> {
    const sbx = this.sbx;
    this.sbx = null;
    if (!sbx) return;
    try {
      await sbx.kill();
    } catch {
      // تجاهل — الـ sandbox هيتقفل لوحده بعد timeoutMs على أي حال
    }
  }
}

/** توافق مع الكود القديم: أمر واحد في sandbox مؤقت (بيتقفل بعده). الحلقة الجديدة بتستخدم SandboxSession. */
export async function runInSandbox(files: SandboxFile[], command: string): Promise<RunCommandResult> {
  const session = new SandboxSession();
  try {
    return await session.run(files, command);
  } finally {
    await session.close();
  }
}
