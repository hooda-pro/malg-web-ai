/**
 * مرفقات الشات (صور + ملفات نصية/كود/PDF/مضغوطة):
 * - الصور: بتترفع كـ data URI، وبتتعرض للمستخدم في فقاعته، وكمان بتتبعت فعليًا
 *   للموديل كصورة حقيقية (مش بس اسمها) — Token Harbor / DeepSeek V4.1 Flash
 *   بيدعم رؤية (vision) فعلاً، شوف buildApiMessageContent تحت وlib/ai.ts.
 * - الملفات النصية/الكود: بيتقرأ محتواها ويتحط في نص الرسالة قبل ما تتبعت.
 * - PDF: استخراج نص خفيف (بدون مكتبة خارجية) — بيشتغل مع أغلب الـ PDF البسيطة
 *   (نص غير مضغوط)، ومش مضمون 100% مع كل PDF (خصوصاً الممسوحة ضوئيًا/المصورة).
 * - ZIP: بيتفك في المتصفح ويتقرأ كل ملف نصي جواه؛ الملفات الثنائية (صور، فيديو...)
 *   بيتسرد اسمها بس من غير محتوى.
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
}

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "yml", "yaml", "ini", "env", "log",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "php", "java", "kt",
  "c", "h", "cpp", "hpp", "cs", "go", "rs", "swift", "sql", "sh", "bash",
  "html", "htm", "css", "scss", "less", "vue", "svelte", "graphql", "toml",
  "dockerfile", "gitignore", "conf", "properties",
]);

const MAX_TEXT_CHARS_PER_FILE = 20_000;
const MAX_ZIP_ENTRIES_READ = 40;

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

async function extractZipContents(file: File): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((e) => !e.dir);
  const parts: string[] = [];
  let read = 0;

  for (const entry of entries) {
    if (read >= MAX_ZIP_ENTRIES_READ) {
      parts.push(`\n… (تم الاكتفاء بأول ${MAX_ZIP_ENTRIES_READ} ملف — الأرشيف فيه ملفات أكتر)`);
      break;
    }
    const ext = extOf(entry.name);
    if (TEXT_EXTENSIONS.has(ext) || ext === "") {
      try {
        const text = await entry.async("string");
        parts.push(`\n--- ${entry.name} ---\n${truncateNote(text, MAX_TEXT_CHARS_PER_FILE)}`);
        read++;
      } catch {
        parts.push(`\n--- ${entry.name} --- (تعذّرت قراءته كنص)`);
      }
    } else {
      parts.push(`\n--- ${entry.name} --- (ملف ثنائي — مش هيتقرأ محتواه)`);
    }
  }

  return parts.join("\n");
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
      att.extractedText = await extractZipContents(file);
    } else if (isPdfFile(file)) {
      const buf = await readAsArrayBuffer(file);
      const text = extractPdfTextBestEffort(buf);
      if (!text || text.length < 5) {
        att.error = "الملف PDF ده مش نص عادي (ممكن يكون صورة ممسوحة) — تم رفعه كمرفق بس من غير استخراج نص";
        att.extractedText = "";
      } else {
        att.extractedText = truncateNote(text, MAX_TEXT_CHARS_PER_FILE);
      }
    } else if (isPlainTextFile(file)) {
      const text = await readAsText(file);
      att.extractedText = truncateNote(text, MAX_TEXT_CHARS_PER_FILE);
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
export function buildAttachmentsPromptBlock(attachments: PendingAttachment[]): string {
  const withText = attachments.filter((a) => a.kind === "text" && a.extractedText && a.extractedText.trim());
  if (withText.length === 0) return "";

  const parts = withText.map(
    (a) => `### ملف مرفق: ${a.file.name}\n\`\`\`\n${a.extractedText}\n\`\`\``
  );
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

/**
 * بيحوّل نص رسالة مستخدم مخزّنة (زي ما هي في الداتابيز، فيها كتلة meta
 * مخفية لو فيها مرفقات) لصيغة الـ content اللي بتتبعت فعليًا للموديل:
 * - مفيش صور مرفقة → نص عادي (string) زي ما كان الوضع قبل كده بالظبط.
 * - فيه صور مرفقة → مصفوفة أجزاء (OpenAI-compatible vision format): جزء
 *   نص واحد (النص المكتوب + محتوى أي ملفات نصية مرفقة) + جزء صورة لكل صورة
 *   (data URI Base64 زي ما هي) — عشان الموديل (لو بيدعم رؤية فعليًا زي
 *   DeepSeek V4.1 Flash عبر Token Harbor) يشوف الصورة فعليًا، مش بس اسمها.
 */
export function buildApiMessageContent(content: string): string | ApiContentPart[] {
  const { visibleText, attachments } = extractAttachmentsMeta(content);
  const images = attachments.filter((a) => a.kind === "image" && a.previewUrl);
  if (images.length === 0) return visibleText;

  const parts: ApiContentPart[] = [{ type: "text", text: visibleText }];
  for (const img of images) {
    parts.push({ type: "image_url", image_url: { url: img.previewUrl! } });
  }
  return parts;
}

const ATTACHMENT_FILE_BLOCK_RE = /### ملف مرفق: (.+)\n```\n([\s\S]*?)\n```/g;
// كل entry جوه zip اتفكّ بيتسجل كـ "\n--- path ---\ncontent" (شوف extractZipContents فوق).
const ZIP_ENTRY_RE = /\n--- (.+?) ---\n([\s\S]*?)(?=\n--- |$)/g;

/**
 * بيستخرج ملفات المشروع الحقيقية اللي المستخدم رفعها كمرفقات (كود/نصوص/PDF
 * مستخرج/محتوى zip اتفكّ) من نص رسالة مستخدم مخزّنة — عشان الـ sandbox
 * (run_command) يقدر يشتغل فعليًا على الملفات اللي المستخدم رفعها بنفسه،
 * مش بس اللي الموديل كتبها في ردوده. الصور مالهاش محتوى نصي فبتتجاهل هنا.
 */
export function extractUserAttachmentFiles(content: string): ProjectFile[] {
  const { visibleText } = extractAttachmentsMeta(content);
  const { filesSection } = extractAttachmentsPromptSection(visibleText);
  if (!filesSection) return [];

  const files: ProjectFile[] = [];
  const blockRe = new RegExp(ATTACHMENT_FILE_BLOCK_RE);
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(filesSection)) !== null) {
    const name = m[1].trim();
    const text = m[2];

    if (extOf(name) === "zip") {
      // ملف zip: كل entry نصي جواه بيتحط كملف منفصل بمساره الأصلي جوه الأرشيف.
      const zipRe = new RegExp(ZIP_ENTRY_RE);
      let zm: RegExpExecArray | null;
      let any = false;
      while ((zm = zipRe.exec(text)) !== null) {
        any = true;
        const entryPath = zm[1].trim();
        const entryContent = zm[2].replace(/\n$/, "");
        files.push({ path: entryPath, content: entryContent });
      }
      if (!any) files.push({ path: name, content: text });
    } else {
      files.push({ path: name, content: text });
    }
  }
  return files;
}
