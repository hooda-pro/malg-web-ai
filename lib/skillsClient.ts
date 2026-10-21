/**
 * جهة المتصفح لنظام المهارات المحلية (Skills).
 *
 * القاعدة: **كل حاجة هنا بتعيش على جهاز المستخدم**.
 * - IndexedDB local (database "mlag-skills") — بتنظف لوحدها لو المستخدم شد
 *   بيانات الموقع، ومفيش أي وصول سيرفر ليها.
 * - استيراد: ملف SKILL.md فردت، أو أرشيف zip، أو مجلد كامل — الكل بيتفك في
 *   المتصفح نفسه (JSZip موجودة فعلًا في المشروع) من غير ما يتصرف أي بايت لسّوني.
 * - مع كل رسالة بتبعت للسيرفر حمولة مؤقّتة (buildSkillsPayload) بالسجل
 *   الفعّال فقط؛ مبنخزنهاش في أي مكان تاني.
 */

import {
  MAX_ENABLED_SKILLS_PER_MESSAGE,
  MAX_SKILL_BODY_CHARS,
  MAX_SKILL_DESC_CHARS,
  MAX_SKILL_FILES,
  MAX_SKILL_FILE_CHARS,
  MAX_SKILLS_PAYLOAD_TOTAL_CHARS,
  fallbackDescription,
  isTextSkillFile,
  parseSkillFrontmatter,
  sanitizeSkillPath,
  skillTotalChars,
  type IncomingSkill,
  type SkillFile,
  type SkillRecord,
} from "./skills";

const DB_NAME = "mlag-skills";
const DB_VERSION = 1;
const STORE = "skills";
const CHANGED_EVENT = "mlag:skills-changed";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("المتصفح مادعمش التخزين المحلي (IndexedDB)"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("تعذّر فتح التخزين المحلي"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("فشل التخزين"));
    tx.onabort = () => reject(tx.error ?? new Error("فشل التخزين"));
  });
}

export async function listSkills(): Promise<SkillRecord[]> {
  const db = await openDb();
  try {
    return await new Promise<SkillRecord[]>((resolve, reject) => {
      const off = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      off.onsuccess = () => {
        const rows = (off.result ?? []).filter((s) => s && typeof s === "object" && typeof (s as SkillRecord).name === "string");
        // أسماء فريدة (آخر استيراد يكسب) ومرتّبة بالاسم عشان التوقعات نفسها في الرسايل.
        const byName = new Map<string, SkillRecord>();
        for (const s of rows as SkillRecord[]) byName.set(s.name, s);
        resolve([...byName.values()].sort((a, b) => a.name.localeCompare(b.name)));
      };
      off.onerror = () => reject(off.error ?? new Error("تعذّر قراءة المهارات"));
    });
  } finally {
    db.close();
  }
}

export async function saveSkillRecord(rec: SkillRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    await txDone(tx);
  } finally {
    db.close();
  }
  notifySkillsChanged();
  void navigator?.storage?.persist?.()?.catch(() => {});
}

export async function deleteSkillRecord(id: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
  notifySkillsChanged();
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<void> {
  const all = await listAllRaw();
  const rec = all.find((s) => s.id === id);
  if (!rec) return;
  rec.enabled = enabled;
  await saveSkillRecord(rec);
}

/** بيرجّع كل السجلات زي ما هي (مفيش توحيد أسماء) — للعمل على نسخة واحدة. */
async function listAllRaw(): Promise<SkillRecord[]> {
  const db = await openDb();
  try {
    return await new Promise<SkillRecord[]>((resolve, reject) => {
      const off = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      off.onsuccess = () => resolve((off.result ?? []) as SkillRecord[]);
      off.onerror = () => reject(off.error ?? new Error("تعذّر قراءة المهارات"));
    });
  } finally {
    db.close();
  }
}

export function notifySkillsChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

/** environment listener للواجهة — بيرجّع دالة تنظيف ليتصفى مع الـ effect. */
export function onSkillsChanged(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGED_EVENT, cb);
  return () => window.removeEventListener(CHANGED_EVENT, cb);
}

/**
 * الحمولة المؤقتة لطلب الشات: مهارات فعّالة فقط (لغاية حد). بتُنادى وقت الإرسال
 * وبتقرأ من IndexedDB مباشرة — أي تغيير في إدارة المهارات بيتطبق في الرسالة الجاية.
 * مفيش id ولا enabled ولا أوقات هنا — مجرد بيانات القراءة.
 */
export async function buildSkillsPayload(): Promise<IncomingSkill[] | undefined> {
  try {
    const all = await listSkills();
    const enabled = all.filter((s) => s.enabled).slice(0, MAX_ENABLED_SKILLS_PER_MESSAGE);
    if (enabled.length === 0) return undefined;
    const out: IncomingSkill[] = [];
    let total = 0;
    for (const s of enabled) {
      const payload = {
        name: s.name.slice(0, 64),
        description: s.description.slice(0, MAX_SKILL_DESC_CHARS),
        body: s.body.slice(0, MAX_SKILL_BODY_CHARS),
        files: s.files.slice(0, MAX_SKILL_FILES).map((f) => ({
          path: f.path,
          content: f.content.slice(0, MAX_SKILL_FILE_CHARS),
        })),
      };
      total += skillTotalChars(payload);
      if (total > MAX_SKILLS_PAYLOAD_TOTAL_CHARS) break;
      out.push(payload);
    }
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// الاستيراد (من المتصفح فقط)
// ---------------------------------------------------------------------------

export interface ImportResult {
  ok: boolean;
  name?: string;
  error?: string;
  note?: string;
}

interface RawEntry {
  path: string;
  text: string;
}

const MAX_ENTRIES_SCAN = 400;
const SKIP_PATH_RE = /(^|\/)(node_modules|\.git|\.next|dist|build|__pycache__|\.venv|venv|coverage)(\/|$)/;

interface Collected {
  entries: RawEntry[];
  skippedBinary: number;
}

/** بتجمع مسارات نظيفة من متصفح (Files / webkitRelativePath) — للمدخل (md/folder). */
async function collectFromFiles(fls: File[]): Promise<Collected> {
  const entries: RawEntry[] = [];
  let skippedBinary = 0;
  for (const f of fls.slice(0, MAX_ENTRIES_SCAN)) {
    const rel = f.webkitRelativePath?.split("/").slice(1).join("/") || f.name;
    const path = sanitizeSkillPath(rel);
    if (!path || SKIP_PATH_RE.test(path)) continue;
    if (!isTextSkillFile(path)) {
      skippedBinary += 1;
      continue;
    }
    if (f.size > MAX_SKILL_FILE_CHARS * 3) {
      skippedBinary += 1;
      continue;
    }
    try {
      const text = await f.text();
      if (!text || text.length > MAX_SKILL_FILE_CHARS) {
        skippedBinary += 1;
        continue;
      }
      entries.push({ path, text });
    } catch {
      skippedBinary += 1;
    }
  }
  return { entries, skippedBinary };
}

/** بيحوّل أرشيف zip لنفس شكل collectFromFiles (بلا مسافات زايدة). */
async function collectFromZip(file: File): Promise<Collected> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(file);
  const listed = Object.values(zip.files).filter((e) => !e.dir);
  const entries: RawEntry[] = [];
  let skippedBinary = 0;
  let scanned = 0;
  // لو المحتوى كله جوه مجلد واحد (skill-name/SKILL.md) ننزّل البادئة عشان
  // بنية المهارة تبقى زي الاستيراد من مجلد.
  const top = new Set<string>();
  for (const e of listed.slice(0, MAX_ENTRIES_SCAN)) top.add(e.name.split("/")[0] || "");
  const rootDirCandidates = [...top].filter((t) => t && listed.some((e) => e.name.startsWith(`${t}/SKILL.md`)));
  const stripPrefix = rootDirCandidates.length === 1 && listed.length > 1 ? rootDirCandidates[0] + "/" : "";
  for (const e of listed) {
    if (scanned >= MAX_ENTRIES_SCAN) break;
    const name = stripPrefix && e.name.startsWith(stripPrefix) ? e.name.slice(stripPrefix.length) : e.name;
    const path = sanitizeSkillPath(name);
    if (!path || SKIP_PATH_RE.test(path)) continue;
    if (!isTextSkillFile(path)) {
      skippedBinary += 1;
      continue;
    }
    scanned += 1;
    try {
      const text = await e.async("string");
      if (!text || text.length > MAX_SKILL_FILE_CHARS) {
        skippedBinary += 1;
        continue;
      }
      entries.push({ path, text });
    } catch {
      skippedBinary += 1;
    }
  }
  return { entries, skippedBinary };
}

function firstUsable(entries: RawEntry[]): { main: RawEntry | null; others: RawEntry[] } {
  // SKILL.md أولوية على أي اسم تاني
  const ordered = [...entries].sort((a, b) => {
    const isSkill = (s: RawEntry) => s.path === "SKILL.md" || s.path.endsWith("/SKILL.md");
    // أقرب للمجذّر الأول
    const depth = (s: RawEntry) => s.path.split("/").length;
    if (isSkill(a) && !isSkill(b)) return -1;
    if (!isSkill(a) && isSkill(b)) return 1;
    return depth(a) - depth(b);
  });
  const main = ordered[0] ?? null;
  return { main, others: ordered.slice(1) };
}

function pickMainBody(entries: RawEntry[]): RawEntry | null {
  const { main } = firstUsable(entries);
  if (!main) return null;
  return main;
}

function fallbackName(path: string, body: string): string {
  const base = path.split("/").pop() || "skill";
  const stem = base.replace(/\.md(x)?$/i, "").replace(/[^A-Za-z0-9\u0600-\u06FF_-]+/g, "-").slice(0, 56);
  const fm = parseSkillFrontmatter(body);
  if (fm.name) return fm.name.slice(0, 64);
  return stem || "skill";
}

/**
 * استيراد من متصفح: تدخل ملف واحد (md/zip) أو مجموعة ملفات (زر «مجلد»).
 * بيرجّع نتيجة بسيطة للواجهة. بيحفظ في IndexedDB من غير أي رفع.
 */
export async function importSkill(fls: File[]): Promise<ImportResult> {
  const files = fls.filter(Boolean);
  if (files.length === 0) return { ok: false, error: "مفيش ملفات اخترتها" };
  let collected: Collected = { entries: [], skippedBinary: 0 };
  let origin = "files";
  try {
    if (files.length === 1 && /\.(zip)$/i.test(files[0].name)) {
      origin = "zip";
      collected = await collectFromZip(files[0]);
    } else {
      collected = await collectFromFiles(files);
    }
  } catch {
    return { ok: false, error: "تعذّر قراءة الملفات — جرّب ملفات نصية عادية" };
  }

  const entries = collected.entries;
  if (entries.length === 0) {
    return {
      ok: false,
      error:
        "ما لقيتش أي ملف نصي صالح داخل المهارة (SKILL.md أو ملفات كود/نص) — الملفات الثنائية بتتسقّط.",
    };
  }

  const mainRaw = pickMainBody(entries);
  if (!mainRaw) return { ok: false, error: "مفيش ملف يبقى نص المهارة الرئيسي" };
  const parsed = parseSkillFrontmatter(mainRaw.text);
  const body = (parsed.body || mainRaw.text).trim().slice(0, MAX_SKILL_BODY_CHARS);
  if (!body.trim()) return { ok: false, error: "ملف المهارة فاضي" };

  const name = (parsed.name || fallbackName(mainRaw.path, mainRaw.text)).trim().slice(0, 64);
  const description = (parsed.description || fallbackDescription(body)).trim().slice(0, MAX_SKILL_DESC_CHARS);

  // الملفات الإضافية: كل حاجة تانية غير الملف الرئيسي
  const skillFiles: SkillFile[] = [];
  let total = body.length;
  for (const e of entries) {
    if (e === mainRaw) continue;
    if (skillFiles.length >= MAX_SKILL_FILES) break;
    const content = e.text.trim().slice(0, MAX_SKILL_FILE_CHARS);
    if (!content) continue;
    total += content.length;
    if (total > MAX_SKILLS_PAYLOAD_TOTAL_CHARS) break;
    if (skillFiles.some((f) => f.path === e.path)) continue;
    skillFiles.push({ path: e.path, content });
  }

  // لو فيه سجل بنفس الاسم (تحميل نفس الـskill تاني) بنكست بدل التكرار —
  // النسخة الجديدة بتاخد حالة التفعيل بتاعة القديمة.
  const existing = (await listAllRaw()).find((s) => s.name === name);
  const record: SkillRecord = {
    id: existing?.id || crypto.randomUUID(),
    name,
    description,
    body,
    files: skillFiles,
    enabled: existing?.enabled ?? true,
    importedAt: new Date().toISOString(),
    origin,
  };

  try {
    await saveSkillRecord(record);
  } catch {
    return { ok: false, error: "تعذّر حفظ المهارة في التخزين المحلي" };
  }

  const note =
    (collected.skippedBinary ?? 0) > 0
      ? `اتسقّط ${(collected.skippedBinary ?? 0)} ملف ثنائي/كبير من المهارة (محدود بالمحتوى النصي).`
      : undefined;
  return { ok: true, name, note };
}

/** تصدير المهارة كـ zip — للتخزين عندك أو سَيتها لحد تاني. محتواها هو كان. */
export async function exportSkillZip(rec: SkillRecord): Promise<void> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file("SKILL.md", `---
name: ${rec.name}
description: ${rec.description || "(بدون وصف)"}
---

${rec.body}`);
  for (const f of rec.files) zip.file(f.path, f.content);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${rec.name.replace(/[^\w\u0600-\u06FF-]+/g, "_") || "skill"}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
