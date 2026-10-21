/**
 * نظام المهارات (Skills) المحلية — بنفس فكرة Agent Skills (ملف SKILL.md
 * مع frontmatter فيه name/description + ملفات إضافية اختيارية).
 *
 * القاعدة الأساسية للميزة دي: **المهارة بتعيش على جهاز المستخدم فقط**.
 * - التخزين كله في المتصفح (IndexedDB — شوف lib/skillsClient.ts).
 * - مش خزّنت في قاعدة البيانات خالص. بتوصل للسيرفر مع كل رسالة كحمولة مؤقتة
 *   في جسم الطلب (body.skills)، وبنستخدمها في بناء السياق وأدوات القراءة، وبتتموت
 *   مع الريكوست — مفيش أي أثر في Neon.
 * - الموديل بيشوف قايمة مختصرة (الاسم + الوصف) في الـ system prompt، ولما
 *   المهارة فعلاً ملزمة يعمل read_skill عشان يقرا الـSKILL.md كامل، و
 *   read_skill_file عشان يقرا أي ملف إضافي (سكربت/قالب/مرجع) جوهها.
 *
 * الملف ده مشترك بين المتصفح والسيرفر — ممنوع أي استيراد لـ DOM أو DB هنا.
 */

export interface SkillFile {
  /** مسار نسبي داخل المهارة، مثال: "scripts/build.sh" */
  path: string;
  content: string;
}

/** السجل الكامل اللي عايش في المتصفح فقط (IndexedDB). */
export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  /** نص SKILL.md بدون الـ frontmatter */
  body: string;
  files: SkillFile[];
  enabled: boolean;
  importedAt: string;
  /** أصل الاستيراد: "md" | "zip" | "folder" | "files" */
  origin: string;
}

/** الحمولة المؤقتة اللي بتتبعت للسيرفر مع كل رسالة (من غير id ولا enabled). */
export interface IncomingSkill {
  name: string;
  description: string;
  body: string;
  files: SkillFile[];
}

// ---------------------------------------------------------------------------
// حدود أمان/توازن (بتطبق في المتصفح وقت الاستيراد وبتتأكد تاني في السيرفر)
// ---------------------------------------------------------------------------
export const MAX_ENABLED_SKILLS_PER_MESSAGE = 8;
export const MAX_SKILL_NAME_CHARS = 64;
export const MAX_SKILL_DESC_CHARS = 400;
export const MAX_SKILL_BODY_CHARS = 24_000;
export const MAX_SKILL_FILES = 40;
export const MAX_SKILL_FILE_PATH_CHARS = 160;
export const MAX_SKILL_FILE_CHARS = 60_000;
/** إجمالي حمولة المهارات كلها مع بعض جوه الطلب (body + ملفات + أسماء). */
export const MAX_SKILLS_PAYLOAD_TOTAL_CHARS = 400_000;
// ميزانية قايمة المهارات في الـ system prompt (بالحروف).
export const SKILLS_MANIFEST_BUDGET_CHARS = 5_000;
// الميزانية المجمعة للنصوص الكاملة (SKILL.md bodies) في مسار «كمّل» — بنفس
// منطق المرفقات (API_INLINE_TOTAL_MAX_CHARS) عشان ماكسرش نوافذ الموديلات
// المجانية الصغيرة.
export const SKILLS_INLINE_TOTAL_BUDGET_CHARS = 24_000;

const BINARY_FILE_RE = /\.(png|jpe?g|gif|webp|bmp|ico|tiff?|avif|heic|mp3|wav|ogg|m4a|flac|aac|mp4|webm|mov|avi|mkv|pdf|docx?|xlsx?|pptx?|one|otf|ttf|woff2?|exe|dll|so|dylib|bin|dat|db|sqlite3?|pyc|class|jar|wasm|zip|7z|rar|gz|tar|iso|img)(\?.*)?$/i;

/** بيشيل بايتات ما بتتخزنش في Postgres (NUL) وعلامات الفواصل الداخلية المخصصة. */
function cleanText(s: string): string {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000\u0008\u000b\u000c\uE000-\uE009]/g, "")
    // حروف اتجاه مخفي ممكن تلخبط عرض النص في الواجهة
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "");
}

/** بتوحّد مسار ملف جوه المهارة: مفيش مسارات مطلقة ولا .. ولا backslash. */
export function sanitizeSkillPath(raw: string, max = MAX_SKILL_FILE_PATH_CHARS): string | null {
  const cleaned = cleanText(String(raw ?? ""))
    .replace(/\\/g, "/")
    .replace(/^[a-zA-Z]:[\\/]/, "")
    .replace(/^\/+/, "")
    .trim();
  if (!cleaned) return null;
  const segs = cleaned.split("/").filter((p) => p && p !== "." );
  if (segs.some((p) => p === ".." )) return null;
  const path = segs.slice(0, 8).join("/");
  if (!path || path.length > max) return null;
  return path;
}

/**
 * بيقرا frontmatter من أول SKILL.md (صيغة Agent Skills القياسية):
 * ---
 * name: pdf-helper
 * description: يستخرج نص وجداول من ملفات PDF...
 * ---
 * وبيشيل الكتلة دي من الـ body اللي بيرجعه.
 */
export function parseSkillFrontmatter(md: string): {
  name: string | null;
  description: string | null;
  body: string;
} {
  const raw = cleanText(String(md ?? ""));
  const m = /^\uFEFF?---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|\r?\n|$)/.exec(raw);
  if (!m) return { name: null, description: null, body: raw };
  const fm = m[1];
  const body = raw.slice(m.index + m[0].length).replace(/^\n+/, "");
  const lines = fm.split("\n");
  let name: string | null = null;
  let description: string | null = null;
  for (const line of lines) {
    const kv = /^([A-Za-z_-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    const val = kv[2].trim().replace(/^["']|["']$/g, "");
    if (key === "name" && val) name = val;
    else if (key === "description" && val) description = val;
  }
  return { name, description, body };
}

/** بيتاخد من أول فقرة لو الوصف ناقص. */
export function fallbackDescription(body: string): string {
  const para = cleanText(String(body ?? ""))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!") && !/^```/.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!para) return "";
  return para.length > 180 ? para.slice(0, 179) + "…" : para;
}

export function isTextSkillFile(path: string): boolean {
  return !BINARY_FILE_RE.test(path);
}

/**
 * تنقية الـskills الواردة من جسم الطلب — ترجّع المستخدم (غلاف لحماية موثوقة-بالمحاولة).
 * الحدود صارمة على كل حقل مهارة، وترجّع السليم فقط.
 */
export function sanitizeIncomingSkills(
  raw: unknown,
  caps?: {
    maxName?: number;
    maxDesc?: number;
    maxBody?: number;
    maxFiles?: number;
    maxFileChars?: number;
    maxFileCount?: number;
    maxPerSkillTotal?: number;
    maxAllTotal?: number;
  }
): IncomingSkill[] {
  const maxName = caps?.maxName ?? MAX_SKILL_NAME_CHARS;
  const maxDesc = caps?.maxDesc ?? MAX_SKILL_DESC_CHARS;
  const maxBody = caps?.maxBody ?? MAX_SKILL_BODY_CHARS;
  const maxFiles = caps?.maxFiles ?? MAX_SKILL_FILES;
  const maxFileChars = caps?.maxFileChars ?? MAX_SKILL_FILE_CHARS;
  const maxPerSkillTotal =
    caps?.maxPerSkillTotal ?? maxBody + maxFiles * maxFileChars; // سقف نظري (المتصفح دايمًا أقل من كده)
  const maxAllTotal = caps?.maxAllTotal ?? MAX_SKILLS_PAYLOAD_TOTAL_CHARS;

  if (!Array.isArray(raw)) return [];
  const out: IncomingSkill[] = [];
  let allTotal = 0;
  const seenNames = new Set<string>();

  for (const item of raw.slice(0, MAX_ENABLED_SKILLS_PER_MESSAGE)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = cleanText(String(o.name ?? "")).replace(/\s+/g, " ").trim().slice(0, maxName);
    if (!name || seenNames.has(name)) continue;
    const body = cleanText(String(o.body ?? "")).slice(0, maxBody);
    if (!body.trim()) continue;
    let total = name.length + body.length;

    const desc = cleanText(String(o.description ?? "")).trim().slice(0, maxDesc);

    const files: SkillFile[] = [];
    let skillTotal = 0;
    const rawFiles = Array.isArray(o.files) ? (o.files as unknown[]) : [];
    for (const f of rawFiles.slice(0, maxFiles)) {
      if (!f || typeof f !== "object") continue;
      const fo = f as Record<string, unknown>;
      const path = sanitizeSkillPath(String(fo.path ?? ""));
      if (!path || !isTextSkillFile(path)) continue;
      const content = cleanText(String(fo.content ?? "")).slice(0, maxFileChars);
      if (!content.trim()) continue;
      if (files.some((x) => x.path === path)) continue;
      skillTotal += content.length;
      if (skillTotal > maxPerSkillTotal) break;
      files.push({ path, content });
      total += content.length;
      if (allTotal + total > maxAllTotal) break;
    }

    if (allTotal + total > maxAllTotal) break;
    allTotal += total;
    seenNames.add(name);
    out.push({ name, description: desc, body, files });
  }
  return out;
}

/** حجم ملف واحد بالنص (بيستخدم في الواجهة والمانيفست). */
export function formatSkillSize(chars: number): string {
  if (chars >= 1024 * 1024) return `${(chars / 1024 / 1024).toFixed(1)} ميجابايت`;
  if (chars >= 1024) return `${Math.round(chars / 1024)} كيلوبايت`;
  return `${chars} حرف`;
}

export function skillTotalChars(s: Pick<SkillRecord, "body" | "files">): number {
  return s.body.length + s.files.reduce((n, f) => n + f.content.length, 0);
}

/**
 * قايمة مختصرة بتنرد للموديل في system prompt: أسماء تختار منها المهارة الملزمة
 * من غير ما يشوف محتواها لسه.
 */
export function buildSkillsManifest(skills: IncomingSkill[]): string {
  if (skills.length === 0) return "";
  const lines: string[] = [];
  let used = 0;
  for (const s of skills) {
    const extra = s.files.length > 0 ? ` (+${s.files.length} ملف إضافي: ${s.files.map((f) => f.path).join(", ").slice(0, 200)})` : "";
    const line = `- ${s.name} — ${s.description || "(بدون وصف)"}${extra}`;
    if (used + line.length > SKILLS_MANIFEST_BUDGET_CHARS && lines.length > 0) break;
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join("\n");
}

/**
 * بلوك المهارات لمسار «كمّل» (/api/chat/continue): المسار ده مفيهوش أدوات،
 * فبنرجع النص الكامل مباشرة (بميزانية إجمالية محدودة على غرار المرفقات) —
 * محتوى مؤقت في سياق الريكوست ومش بيتخزن في الداتابيز.
 */
export function buildSkillsContinueBlock(skills: IncomingSkill[]): string {
  if (skills.length === 0) return "";
  const head =
    "مهارات المستخدم المحلية الفعّالة (محفوظة على جهازه بس — عاملها زي تعليمات ملزمة منه):";
  const lines: string[] = [head];
  let used = head.length;
  for (const s of skills) {
    const filesLine = s.files.length > 0 ? `\n[ملفات إضافية: ${s.files.map((f) => f.path).join(", ")}]` : "";
    const bodyLine = `\n=== ${s.name} ===\n${s.body.slice(0, Math.floor(SKILLS_INLINE_TOTAL_BUDGET_CHARS / Math.max(skills.length, 1)))}${filesLine}`;
    if (used + bodyLine.length > SKILLS_INLINE_TOTAL_BUDGET_CHARS && lines.length > 1) break;
    lines.push(bodyLine);
    used += bodyLine.length;
  }
  return lines.join("\n");
}
