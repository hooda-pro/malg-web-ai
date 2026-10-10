/**
 * مرفقات الشات (صور + فيديو + ملفات نصية/كود/PDF/مضغوطة):
 * - الصور: بتترفع كـ data URI، وبتتعرض للمستخدم في فقاعته، وكمان بتتبعت فعليًا
 *   للموديل كصورة حقيقية (مش بس اسمها) — Token Harbor / DeepSeek V4.1 Flash
 *   بيدعم رؤية (vision) فعلاً، شوف buildApiMessageContent تحت وlib/ai.ts.
 * - الملفات النصية/الكود: بيتقرأ محتواها ويتحط في نص الرسالة قبل ما تتبعت.
 * - PDF: استخراج نص خفيف (بدون مكتبة خارجية) — بيشتغل مع أغلب الـ PDF البسيطة
 *   (نص غير مضغوط)، ومش مضمون 100% مع كل PDF (خصوصاً الممسوحة ضوئيًا/المصورة).
 * - ZIP: بيتفك في المتصفح ويتقرأ كل ملف نصي جواه؛ الملفات الثنائية (صور...)
 *   بيتسرد اسمها بس من غير محتوى (ماعدا الفيديو - شوف تحت).
 * - الفيديو (MP4/WebM/MOV/...): بيتستخرج منه لقطات JPEG في المتصفح نفسه عبر
 *   canvas وبتتبعت للموديل كصور حقيقية بالترتيب الزمني - من غير سيرفر ومن غير
 *   مكتبات خارجية. الموديلات النصية البحتة هتشوف اللقطات كصور عادية.
 */

import type { ProjectFile } from "./parseContent";

export type AttachmentKind = "image" | "text";

export interface PendingAttachment {
  id: string;
  file: File;
  kind: AttachmentKind;
  /** data URI — للصور بس، لعرض الصورة قبل وبعد الإرسال */
  previewUrl?: string;
  /** المحتوى النصي المستخرج (لملفات النص/الكود/PDF/ملفات الـ zip الداخلية) */
  extractedText?: string;
  /** true أثناء القراءة/الاستخراج */
  loading: boolean;
  /** لو فشل الاستخراج (PDF معقد، ملف ثنائي غير مدعوم...) */
  error?: string;
  /** ملاحظة معلوماتية (مش خطأ): مثلًا "اتقرا 98 ملف — اتخطّينا node_modules" */
  note?: string;
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "yml", "yaml", "ini", "env", "log",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "php", "java", "kt",
  "c", "h", "cpp", "hpp", "cs", "go", "rs", "swift", "sql", "sh", "bash",
  "html", "htm", "css", "scss", "less", "vue", "svelte", "graphql", "toml",
  "dockerfile", "gitignore", "conf", "properties", "svg", "mdx", "prisma", "gradle", "kts", "dart",
]);

// حد التخزين لكل ملف (الملف بيتخزّن كامل عشان الـ sandbox يشتغل على نسخة سليمة).
// ده مش الحد اللي بيتبعت للموديل — اللي بيتبعت للموديل قايمة أسماء + أداة read_file
// (شوف toApiUserContent تحت)، فحجم الملفات هنا مبيتحوّلش لتوكنز تلقائيًا.
const MAX_STORED_CHARS_PER_FILE = 300_000;
const MAX_ZIP_ENTRIES_READ = 400;
// سقف إجمالي محتوى الـ zip المتخزّن في الرسالة (حماية لحجم الطلب وقاعدة البيانات).
const MAX_ZIP_TOTAL_CHARS = 1_500_000;
// مجلدات/ملفات مش مفيدة للموديل ولا للـ sandbox وبتاكل الميزانية على الفاضي.
const SKIP_PATH_RE = /(^|\/)(node_modules|\.git|\.next|\.turbo|\.vercel|dist|build|coverage|__pycache__|\.venv|venv)(\/|$)/;
const SKIP_FILE_RE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|\.DS_Store)$/;

/** حدود ما يتبعت فعليًا للموديل (بالحروف) — شوف toApiUserContent. */
export const API_INLINE_FILE_MAX_CHARS = 12_000;
export const API_INLINE_TOTAL_MAX_CHARS = 24_000;
export const API_MANIFEST_MAX_ENTRIES = 200;

function extOf(name: string): string {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function isZipFile(file: File): boolean {
  return extOf(file.name) === "zip" || file.type === "application/zip";
}

function isPdfFile(file: File): boolean {
  return extOf(file.name) === "pdf" || file.type === "application/pdf";
}

function isPlainTextFile(file: File): boolean {
  if (TEXT_EXTENSIONS.has(extOf(file.name))) return true;
  return file.type.startsWith("text/") || file.type === "application/json";
}

const VIDEO_EXTENSIONS = new Set([
  "mp4", "webm", "mov", "mkv", "avi", "m4v", "3gp", "ogv", "mpg", "mpeg",
]);

export function isVideoFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return VIDEO_EXTENSIONS.has(extOf(file.name));
}

// سقف اللقطات وحجمها: 6 لقطات × ~640px بجودة متوسطة ≈ نص ميجا إجمالي،
// رقم معقول يتحفظ في الرسالة ويتبعت للموديل من غير ما ياكل التوكنز.
const MAX_VIDEO_FRAMES = 6;
const MAX_VIDEO_FRAME_WIDTH = 640;
const VIDEO_FRAME_QUALITY = 0.65;
const VIDEO_SEEK_TIMEOUT_MS = 8000;

function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function seekVideo(video: HTMLVideoElement, at: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("seek-timeout"));
    }, VIDEO_SEEK_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      video.onseeked = null;
      video.onerror = null;
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("seek-error"));
    };
    video.onseeked = () => {
      cleanup();
      resolve();
    };
    try {
      video.currentTime = at;
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

export interface VideoFramesResult {
  frames: { dataUrl: string; atSec: number }[];
  durationSec: number;
}

/** Frames spread across the video (5%-95%) via hidden video element + canvas. */
export async function extractVideoFrames(
  file: File,
  maxFrames = MAX_VIDEO_FRAMES
): Promise<VideoFramesResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
  // عنصر مخفي في الصفحة (بعض المتصفحات - خصوصا iOS - ترفض الالتقاط من عنصر منفصل)
  video.style.cssText =
    "position:fixed;left:-9999px;top:0;width:4px;height:4px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("meta-timeout")), VIDEO_SEEK_TIMEOUT_MS);
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("load-error"));
      };
      video.src = url;
    });
    const durationSec =
      Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (!durationSec) throw new Error("no-duration");
    const n = Math.max(2, Math.floor(maxFrames));
    const canvas = document.createElement("canvas");
    const frames: { dataUrl: string; atSec: number }[] = [];
    for (let i = 0; i < n; i++) {
      const at = durationSec * (0.04 + (0.92 * i) / (n - 1));
      await seekVideo(video, Math.min(at, Math.max(0, durationSec - 0.1)));
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 360;
      const scale = Math.min(1, MAX_VIDEO_FRAME_WIDTH / vw);
      canvas.width = Math.max(2, Math.round(vw * scale));
      canvas.height = Math.max(2, Math.round(vh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no-canvas");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push({ dataUrl: canvas.toDataURL("image/jpeg", VIDEO_FRAME_QUALITY), atSec: at });
    }
    return { frames, durationSec };
  } finally {
    URL.revokeObjectURL(url);
    try {
      video.removeAttribute("src");
      video.load();
    } catch {
      // ignore
    }
    video.remove();
  }
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * فيديو -> لقطات صور (kind image) بأسماء مميزة، بتتبعت للموديل كصور حقيقية
 * بالترتيب عبر نفس مسار الصور (buildApiMessageContent) من غير أي تغيير تاني.
 */
export async function processVideoFile(file: File): Promise<PendingAttachment[]> {
  try {
    const { frames, durationSec } = await extractVideoFrames(file);
    if (frames.length === 0) throw new Error("no-frames");
    const base = (file.name.replace(/\.[^.]+$/, "") || "video").slice(0, 60);
    const durLabel = fmtClock(durationSec);
    return frames.map((f, i) => {
      const frameFile = new File(
        [dataUrlToBytes(f.dataUrl)],
        `${base}_frame${i + 1}.jpg`,
        { type: "image/jpeg" }
      );
      const att: PendingAttachment = {
        id: makeAttachmentId(),
        file: frameFile,
        kind: "image",
        previewUrl: f.dataUrl,
        loading: false,
        note: `Frame ${fmtClock(f.atSec)} of video (${durLabel})`,
      };
      return att;
    });
  } catch {
    return [
      {
        id: makeAttachmentId(),
        file,
        kind: "text",
        loading: false,
        error: "Could not extract frames (unsupported codec). Try MP4.",
      },
    ];
  }
}

function truncateNote(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n… (تم اقتطاع الباقي — الملف أطول من ${limit.toLocaleString("en-US")} حرف)`;
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsText(file);
  });
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * استخراج نص خفيف من PDF بدون مكتبة خارجية: بيدور على أوامر إظهار النص
 * (Tj / TJ) جوه streams الصفحات ويطلع النص منها. بيشتغل مع PDF نصي بسيط،
 * ومش هيقدر يقرأ PDF ممسوح ضوئيًا (صورة) أو معقد الترميز.
 */
function extractPdfTextBestEffort(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let raw = "";
  for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);

  const chunks: string[] = [];
  // كل جزء بين BT (بداية نص) و ET (نهاية نص)
  const btEtRe = /BT([\s\S]*?)ET/g;
  let m: RegExpExecArray | null;
  while ((m = btEtRe.exec(raw)) !== null) {
    const block = m[1];
    // النص جوه أقواس () قبل Tj، أو جوه [] قبل TJ
    const tjRe = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
    let tm: RegExpExecArray | null;
    while ((tm = tjRe.exec(block)) !== null) chunks.push(unescapePdfString(tm[1]));

    const tjArrRe = /\[((?:[^\[\]]|\\.)*)\]\s*TJ/g;
    let am: RegExpExecArray | null;
    while ((am = tjArrRe.exec(block)) !== null) {
      const arr = am[1];
      const partRe = /\(((?:[^()\\]|\\.)*)\)/g;
      let pm: RegExpExecArray | null;
      let line = "";
      while ((pm = partRe.exec(arr)) !== null) line += unescapePdfString(pm[1]);
      if (line) chunks.push(line);
    }
    chunks.push("\n");
  }

  return chunks.join(" ").replace(/[ \t]{2,}/g, " ").replace(/\n{2,}/g, "\n").trim();
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

export interface ZipEntryLike {
  name: string;
  read: () => Promise<string>;
}

export interface ZipTextResult {
  text: string;
  /** عدد الملفات النصية اللي اتقرت فعلًا */
  readCount: number;
  /** ملاحظة جاهزة للعرض للمستخدم لو اتخطينا حاجة (ملفات كتير/كبيرة/ثنائية...) */
  notice: string | null;
}

/**
 * بيبني نص الـ zip من قايمة entries (منفصلة عن JSZip عشان تتختبر لوحدها).
 * الفورمات: كل ملف "\n=== FILE: المسار ===\nالمحتوى" (الفورمات القديم "--- المسار ---"
 * لسه بيتقرا للرسايل المخزّنة قبل كده، بس اتغيّر لأن سطر زي "--- x ---" جوه ملف
 * markdown كان بيتفسّر كبداية ملف جديد). المحتوى بيتخزّن كامل (لحد
 * MAX_STORED_CHARS_PER_FILE) — مفيش اقتطاع بيتحط جوه المحتوى نفسه إلا لو الملف
 * فعلًا أكبر من السقف، عشان الـ sandbox ميشتغلش على ملف مكسور.
 */
export async function buildZipText(entries: ZipEntryLike[]): Promise<ZipTextResult> {
  const parts: string[] = [];
  let read = 0;
  let total = 0;
  let skippedIgnored = 0;
  let skippedBinary = 0;
  let skippedBudget = 0;
  let truncatedFiles = 0;

  for (const entry of entries) {
    if (SKIP_PATH_RE.test(entry.name) || SKIP_FILE_RE.test(entry.name)) {
      skippedIgnored++;
      continue;
    }
    const ext = extOf(entry.name);
    const isText = TEXT_EXTENSIONS.has(ext) || ext === "";
    if (!isText) {
      skippedBinary++;
      parts.push(`\n=== FILE: ${entry.name} === (ملف ثنائي — مش هيتقرأ محتواه)`);
      continue;
    }
    if (read >= MAX_ZIP_ENTRIES_READ || total >= MAX_ZIP_TOTAL_CHARS) {
      skippedBudget++;
      continue;
    }
    try {
      let text = await entry.read();
      if (text.length > MAX_STORED_CHARS_PER_FILE) {
        text = truncateNote(text, MAX_STORED_CHARS_PER_FILE);
        truncatedFiles++;
      }
      if (total + text.length > MAX_ZIP_TOTAL_CHARS) {
        skippedBudget++;
        continue;
      }
      parts.push(`\n=== FILE: ${entry.name} ===\n${text}`);
      total += text.length;
      read++;
    } catch {
      parts.push(`\n=== FILE: ${entry.name} === (تعذّرت قراءته كنص)`);
    }
  }

  const notes: string[] = [];
  if (skippedIgnored > 0) notes.push(`اتخطّينا ${skippedIgnored} ملف/مجلد غير مفيد (node_modules / lock files / build...)`);
  if (skippedBudget > 0) notes.push(`${skippedBudget} ملف نصي مااتقراش لأن الأرشيف أكبر من الحد المسموح`);
  if (truncatedFiles > 0) notes.push(`${truncatedFiles} ملف اتقطع لأنه ضخم`);
  if (skippedBinary > 0) notes.push(`${skippedBinary} ملف ثنائي اتسرد اسمه بس`);

  return {
    text: parts.join("\n"),
    readCount: read,
    notice: notes.length ? `اتقرا ${read} ملف — ${notes.join(" • ")}` : null,
  };
}

async function extractZipContents(file: File): Promise<ZipTextResult> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files)
    .filter((e) => !e.dir)
    .map((e) => ({ name: e.name, read: () => e.async("string") }));
  return buildZipText(entries);
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

let uid = 0;
export function makeAttachmentId(): string {
  uid += 1;
  return `att-${Date.now()}-${uid}`;
}

/** بيبني PendingAttachment من ملف ويبدأ يقرأ/يستخرج محتواه فورًا. */
export async function processFile(file: File): Promise<PendingAttachment> {
  const id = makeAttachmentId();

  if (isImageFile(file)) {
    const att: PendingAttachment = { id, file, kind: "image", loading: true };
    try {
      att.previewUrl = await readAsDataURL(file);
    } catch {
      att.error = "تعذّر تحميل الصورة";
    }
    att.loading = false;
    return att;
  }

  const att: PendingAttachment = { id, file, kind: "text", loading: true };
  try {
    if (isZipFile(file)) {
      const zipResult = await extractZipContents(file);
      att.extractedText = zipResult.text;
      if (zipResult.notice) att.note = zipResult.notice;
    } else if (isPdfFile(file)) {
      const buf = await readAsArrayBuffer(file);
      const text = extractPdfTextBestEffort(buf);
      if (!text || text.length < 5) {
        att.error = "الملف PDF ده مش نص عادي (ممكن يكون صورة ممسوحة) — تم رفعه كمرفق بس من غير استخراج نص";
        att.extractedText = "";
      } else {
        att.extractedText = truncateNote(text, MAX_STORED_CHARS_PER_FILE);
      }
    } else if (isPlainTextFile(file)) {
      const text = await readAsText(file);
      att.extractedText = truncateNote(text, MAX_STORED_CHARS_PER_FILE);
    } else {
      att.error = "نوع ملف غير مدعوم للقراءة — تم رفعه كمرفق بس";
    }
  } catch {
    att.error = "تعذّرت قراءة الملف";
  }
  att.loading = false;
  return att;
}

/**
 * بيبني الجزء اللي بيتضاف لنص الرسالة المرسلة فعليًا للموديل: محتوى كل ملف
 * نصي/كود/PDF/zip متسرد بوضوح تحت اسم الملف. الصور مالهاش نص هنا (بتتبعت
 * كصورة حقيقية منفصلة عبر buildApiMessageContent، مش كنص)، وبيتم تجاهل أي
 * ملف فشل استخراجه أو من غير محتوى.
 */
/** بيختار سياج (fence) أطول من أي سلسلة backticks جوه المحتوى — عشان ملف فيه ``` (زي README) ميقفلش الكتلة بدري. */
function fenceFor(content: string): string {
  let longest = 0;
  for (const m of content.matchAll(/`+/g)) longest = Math.max(longest, m[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

export function buildAttachmentsPromptBlock(attachments: PendingAttachment[]): string {
  const withText = attachments.filter((a) => a.kind === "text" && a.extractedText && a.extractedText.trim());
  if (withText.length === 0) return "";

  const parts = withText.map((a) => {
    const body = a.extractedText as string;
    const fence = fenceFor(body);
    return `### ملف مرفق: ${a.file.name}\n${fence}\n${body}\n${fence}`;
  });
  return `\n\n---\nمرفقات المستخدم (محتوى الملفات اللي بعتها):\n${parts.join("\n\n")}`;
}

/**
 * الوسم اللي بيلف كتلة بيانات المرفقات الشكلية (صور Base64 + أسماء ملفات) جوه نص الرسالة المخزّن.
 * ملحوظة مهمة: لازم يكون الوسم مبني من حروف Unicode عادية (هنا استخدمنا نطاق
 * Private Use Area) وليس بايت NUL (\u0000). Postgres/Neon بيرفض تخزين أي نص
 * فيه بايت NUL في عمود من نوع text ويطلع خطأ عند الـ INSERT — وده كان بيكسّر
 * حفظ أي رسالة فيها مرفقات (كل مرة، أي نوع ملف) قبل ما نضيف الحماية دي.
 */
export const ATTACHMENTS_META_START = "\uE000MLAG_ATTACHMENTS_START\uE000";
export const ATTACHMENTS_META_END = "\uE000MLAG_ATTACHMENTS_END\uE000";

export interface StoredAttachmentMeta {
  name: string;
  size: number;
  kind: AttachmentKind;
  /** data URI — للصور بس */
  previewUrl?: string;
}

interface AttachmentLike {
  file: File;
  kind: AttachmentKind;
  previewUrl?: string;
}

/**
 * بيبني كتلة بيانات مخفية (JSON بين وسمين فريدين) بتتحط في آخر نص الرسالة
 * المخزّن في الداتابيز، عشان MessageItem يقدر يستخرج منها صور/أسماء الملفات
 * ويعرضها فوق فقاعة المستخدم من غير ما تتقرأ كنص عادي وسط الرسالة.
 */
export function buildAttachmentsMetaBlock(attachments: AttachmentLike[]): string {
  if (attachments.length === 0) return "";
  const meta: StoredAttachmentMeta[] = attachments.map((a) => ({
    name: a.file.name,
    size: a.file.size,
    kind: a.kind,
    previewUrl: a.kind === "image" ? a.previewUrl : undefined,
  }));
  return `\n${ATTACHMENTS_META_START}${JSON.stringify(meta)}${ATTACHMENTS_META_END}`;
}

/** بيفصل كتلة بيانات المرفقات عن نص الرسالة الأصلي (النص المرئي + الجزء المستخرج للملفات، لو موجود). */
export function extractAttachmentsMeta(content: string): {
  visibleText: string;
  attachments: StoredAttachmentMeta[];
} {
  const startIdx = content.indexOf(ATTACHMENTS_META_START);
  if (startIdx === -1) return { visibleText: content, attachments: [] };

  const endIdx = content.indexOf(ATTACHMENTS_META_END);
  if (endIdx === -1) return { visibleText: content, attachments: [] };

  const jsonStr = content.slice(startIdx + ATTACHMENTS_META_START.length, endIdx);
  let attachments: StoredAttachmentMeta[] = [];
  try {
    attachments = JSON.parse(jsonStr);
  } catch {
    attachments = [];
  }

  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + ATTACHMENTS_META_END.length);
  return { visibleText: (before + after).trimEnd(), attachments };
}

/** بيفصل كتلة "مرفقات المستخدم (محتوى الملفات...)" المستخرجة عن باقي النص، عشان تتعرض كقسم قابل للطي. */
export function extractAttachmentsPromptSection(text: string): {
  mainText: string;
  filesSection: string | null;
} {
  const marker = "\n\n---\nمرفقات المستخدم (محتوى الملفات اللي بعتها):\n";
  const idx = text.indexOf(marker);
  if (idx === -1) return { mainText: text, filesSection: null };
  return {
    mainText: text.slice(0, idx).trimEnd(),
    filesSection: text.slice(idx + marker.length),
  };
}

export type ApiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

// ---------------------------------------------------------------------------
// قراءة الملفات المرفقة من النص المخزّن
// ---------------------------------------------------------------------------

export interface AttachedFile extends ProjectFile {
  /** true لو الملف اتقطع وقت الرفع لأنه أكبر من السقف */
  truncated?: boolean;
}

// محتوى الملف بيتغلف بسياج backticks (3 أو أكتر). الإغلاق لازم يكون بنفس طول
// السياج وبعده إمّا كتلة ملف تانية أو نهاية النص — ده اللي بيخلّي ملف جواه ```
// (زي README.md) مايقطعش القراءة بدري زي ما كان بيحصل قبل كده.
const ATTACHMENT_FILE_BLOCK_RE = /### ملف مرفق: (.+)\n(`{3,})\n([\s\S]*?)\n\2(?=\n\n### ملف مرفق: |\s*$)/g;
// عنوان entry جوه zip: "\n--- path ---" متبوع بسطر جديد أو علامة "(ملف ثنائي".
const ZIP_HEADER_RE = /\n=== FILE: ([^\n]+?) ===(?=\n| \()/g;
// الفورمات القديم (رسايل اتخزنت قبل التعديل) — fallback بس.
const ZIP_HEADER_RE_LEGACY = /\n--- ([^\n]+?) ---(?=\n| \()/g;
const TRUNCATION_NOTE_RE = /\n… \(تم اقتطاع الباقي — الملف أطول من [\d,]+ حرف\)$/;

function splitZipEntries(text: string): AttachedFile[] {
  const headers: { path: string; start: number; end: number }[] = [];
  const re = new RegExp(text.includes("\n=== FILE: ") ? ZIP_HEADER_RE : ZIP_HEADER_RE_LEGACY);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    headers.push({ path: m[1].trim(), start: m.index, end: m.index + m[0].length });
  }

  const files: AttachedFile[] = [];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const bodyStart = h.end;
    const nextStart = i + 1 < headers.length ? headers[i + 1].start : text.length;
    let body = text.slice(bodyStart, nextStart);
    // الملفات الثنائية/اللي فشلت قراءتها مالهاش جسم (بعد العنوان مباشرة " (...)").
    if (body.startsWith(" (")) continue;
    if (body.startsWith("\n")) body = body.slice(1); // السطر الجديد اللي بعد العنوان
    // "\n" الفاصل بين الـ entries — موجود بعد كل entry ما عدا الأخير.
    if (i + 1 < headers.length) body = body.replace(/\n$/, "");
    files.push(finalizeFile(h.path, body));
  }
  return files;
}

function finalizeFile(path: string, content: string): AttachedFile {
  if (TRUNCATION_NOTE_RE.test(content)) {
    return { path, content: content.replace(TRUNCATION_NOTE_RE, ""), truncated: true };
  }
  return { path, content };
}

/**
 * بيستخرج ملفات المشروع الحقيقية اللي المستخدم رفعها كمرفقات (كود/نصوص/PDF
 * مستخرج/محتوى zip اتفكّ) من نص رسالة مستخدم مخزّنة — عشان الـ sandbox
 * (run_command) وأداتين read_file/list_files يقدروا يشتغلوا فعليًا على الملفات
 * اللي المستخدم رفعها بنفسه. الصور مالهاش محتوى نصي فبتتجاهل هنا.
 */
export function extractUserAttachmentFiles(content: string): AttachedFile[] {
  const { visibleText } = extractAttachmentsMeta(content);
  const { filesSection } = extractAttachmentsPromptSection(visibleText);
  if (!filesSection) return [];

  const files: AttachedFile[] = [];
  const blockRe = new RegExp(ATTACHMENT_FILE_BLOCK_RE);
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(filesSection)) !== null) {
    const name = m[1].trim();
    const text = m[3];

    if (extOf(name) === "zip") {
      const entries = splitZipEntries("\n" + text);
      if (entries.length > 0) files.push(...entries);
      else files.push(finalizeFile(name, text));
    } else {
      files.push(finalizeFile(name, text));
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// اللي بيتبعت للموديل فعليًا (بدل ما كل محتوى الملفات يتبعت في كل نداء)
// ---------------------------------------------------------------------------

export interface ApiContentOptions {
  /** ميزانية الحروف اللي مسموح تتحط inline من الملفات الصغيرة في الرسالة دي (0 = قايمة أسماء بس). */
  inlineBudgetChars?: number;
  /** false → الصور مبتتبعتش (بتتحول لسطر نصي) — لرسايل قديمة عشان نوفر توكنز. */
  includeImages?: boolean;
}

function countLines(text: string): number {
  return text ? text.split("\n").length : 0;
}

/** قايمة الملفات اللي الموديل يقدر يقراها بـ read_file — مختصرة (اسم + عدد أسطر). */
export function buildFilesManifest(files: AttachedFile[], inlinedPaths: Set<string> = new Set()): string {
  if (files.length === 0) return "";
  const shown = files.slice(0, API_MANIFEST_MAX_ENTRIES);
  const lines = shown.map((f) => {
    const flags = [
      `${countLines(f.content)} سطر`,
      f.truncated ? "مقصوص" : null,
      inlinedPaths.has(f.path) ? "محتواه فوق" : null,
    ].filter(Boolean);
    return `- ${f.path} (${flags.join("، ")})`;
  });
  if (files.length > shown.length) lines.push(`- … و${files.length - shown.length} ملف تاني (استخدم list_files لعرضهم كلهم)`);
  return lines.join("\n");
}

/**
 * بيحوّل رسالة مستخدم مخزّنة لـ content بيتبعت للموديل:
 * - النص المكتوب بيتبعت زي ما هو.
 * - الملفات المرفقة: مش بتتبعت كلها. الملفات النصية الصغيرة (≤ 12k حرف) بتتحط
 *   inline لحد ميزانية إجمالية، والباقي (وأي zip) بيتحوّل لقايمة أسماء والموديل
 *   يقرا اللي محتاجه بأداة read_file. ده اللي بيمنع رسالة فيها zip من إنها تاكل
 *   100 ألف توكن في كل نداء.
 * - الصور: بتتبعت كصورة حقيقية بس لو includeImages (آخر رسالة فيها صور).
 */
export function toApiUserContent(content: string, opts: ApiContentOptions = {}): string | ApiContentPart[] {
  const inlineBudget = opts.inlineBudgetChars ?? 0;
  const includeImages = opts.includeImages ?? true;

  const { visibleText, attachments } = extractAttachmentsMeta(content);
  const { mainText, filesSection } = extractAttachmentsPromptSection(visibleText);

  let text = mainText;
  if (filesSection) {
    const files = extractUserAttachmentFiles(content);

    // مرشحين الـ inline: الملفات اللي اترفعت كملف مستقل (مش من جوه zip) وصغيرة.
    const standaloneNames = new Set(attachments.filter((a) => a.kind === "text").map((a) => a.name));
    let budget = inlineBudget;
    const inlined = new Set<string>();
    const inlineParts: string[] = [];
    for (const f of files) {
      if (!standaloneNames.has(f.path)) continue;
      if (f.content.length > API_INLINE_FILE_MAX_CHARS || f.content.length > budget) continue;
      budget -= f.content.length;
      inlined.add(f.path);
      const fence = fenceFor(f.content);
      inlineParts.push(`### ${f.path}\n${fence}\n${f.content}\n${fence}`);
    }

    const manifest = buildFilesManifest(files, inlined);
    const blocks: string[] = [];
    if (inlineParts.length) blocks.push(inlineParts.join("\n\n"));
    if (manifest) {
      blocks.push(
        `الملفات المرفقة (${files.length}) — قايمة بس عشان التوكنز. اقرا أي ملف تحتاجه بأداة read_file، واعرض القايمة بـ list_files:\n${manifest}`
      );
    }
    if (blocks.length) text = `${mainText}\n\n---\nمرفقات المستخدم:\n${blocks.join("\n\n")}`.trim();
  }

  const images = attachments.filter((a) => a.kind === "image" && a.previewUrl);
  if (images.length === 0) return text;

  if (!includeImages) {
    const names = images.map((a) => a.name).join("، ");
    return `${text}\n\n[المستخدم كان بعت ${images.length} صورة (${names}) في رسالة قديمة — اتشالت من السياق لتوفير التوكنز]`.trim();
  }

  // Video frames travel as plain images, so label their groups in the text part
  // (sent to the model only - stored content stays clean). Groups share the
  // "<base>_frameN.jpg" naming from processVideoFile, in chronological order.
  const videoGroups = new Map<string, number>();
  for (const img of images) {
    const m = img.name.match(/^(.*)_frame\d+\.jpg$/);
    if (m) videoGroups.set(m[1], (videoGroups.get(m[1]) ?? 0) + 1);
  }
  let labeledText = text;
  if (videoGroups.size > 0) {
    const lines = [...videoGroups.entries()].map(
      ([base, n]) => `Attached video "${base}" as ${n} chronological frames - the following images are its frames in order. ` +
        `These frames are SILENT stills: there is NO audio. Never invent or quote spoken words, dialogue, lyrics, or sounds ` +
        `from them. If the user asks what was said/heard, say honestly you cannot hear audio from uploaded videos, ` +
        `and suggest alternatives: a YouTube/public link (transcribable via tools) or the user describing what was said.`
    );
    labeledText = `${text}\n\n${lines.join("\n")}`.trim();
  }

  const parts: ApiContentPart[] = [{ type: "text", text: labeledText }];
  for (const img of images) {
    parts.push({ type: "image_url", image_url: { url: img.previewUrl! } });
  }
  return parts;
}

/** توافق مع الكود القديم: نفس السلوك القديم (نص + صور) لكن بقايمة أسماء بدل محتوى الملفات. */
export function buildApiMessageContent(content: string): string | ApiContentPart[] {
  return toApiUserContent(content, { inlineBudgetChars: API_INLINE_TOTAL_MAX_CHARS, includeImages: true });
}

/**
 * عدد التوكنز (تقدير) اللي رسالة المستخدم بتكلّفه فعليًا لما تتبعت للموديل بعد
 * التحويل — من غير بيانات الصور Base64 (كل صورة ≈ ثابت) ومن غير محتوى الملفات
 * اللي مابتتبعتش.
 */
export function apiUserContentLength(content: string | ApiContentPart[]): { chars: number; images: number } {
  if (typeof content === "string") return { chars: content.length, images: 0 };
  let chars = 0;
  let images = 0;
  for (const p of content) {
    if (p.type === "text") chars += p.text.length;
    else images += 1;
  }
  return { chars, images };
}
