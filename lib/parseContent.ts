export interface ProjectFile {
  path: string;
  content: string;
}

/** نتيجة فحص ذيل النص عن كتلة كود مفتوحة غير مقفولة (رد اتقطع في نص ملف). */
export interface UnclosedFence {
  language: string;
  path: string;
  body: string;
}

// أي كتلة كود عامة (التسليم الحقيقي بـ path، والشرح التوضيحي من غيره)
const GENERIC_FENCE_REGEX = /```([a-zA-Z0-9_+\-]*)(?:[ \t]+path="([^"]*)")?[ \t]*\r?\n([\s\S]*?)```/g;

/**
 * بيلاقي كتلة كود مفتوحة وغير مقفولة في النص — بيشيل الكتل المقفولة الأول
 * وبعدين يدور على فتحة بلا إغلاق بعدها. بيرجع null لو كل الكتل مقفولة
 * أو مفيش كتل أصلًا. مستخدم في العرض (إخفاء الكود الناقص من الشات وإظهاره
 * في كارت الملفات مع زرار «كمّل») وفي التكملة (تعليمات تكملة داخل نفس
 * الكتلة بدل فتح واحدة جديدة مكررة).
 */
export function findUnclosedFence(content: string): UnclosedFence | null {
  // نشيل الكتل المقفولة الأول — الباقي بس هو اللي ممكن يكون مقطوعًا.
  // (سطر الإغلاق نفسه بيطابق نمط الفتحة، فمن غير الخطوة دي أي رد مقفول
  // كان هيتفسر غلط على إنه مفتوح.)
  const withoutClosed = content.replace(new RegExp(GENERIC_FENCE_REGEX), "");
  const m = /```([a-zA-Z0-9_+\-]*)(?:[ \t]+path="([^"]*)")?[ \t]*\r?\n([\s\S]*)$/.exec(withoutClosed);
  if (!m) return null;
  return { language: m[1] || "", path: (m[2] || "").trim(), body: m[3] };
}

/**
 * ملفات التسليم الحقيقية فقط: كتل الكود اللي عليها path="..." صريح — مقفولة
 * أو مقطوعة في الآخر. ده اللي بيظهر في كارت الملفات ولوحة المعاينة والـ zip،
 * وبيتخبى من نص الشات. كتل الشرح التوضيحية (من غير path) بتفضل inline في
 * النص زي Claude — مش ملفات، ومبتظهرش في الكروت ولا اللوحة ولا الـ sandbox.
 */
const DELIVERABLE_FENCE_REGEX = /```([a-zA-Z0-9_+\-]*)(?:[ \t]+path="([^"]*)")[ \t]*\n([\s\S]*?)```/g;

// ---------------------------------------------------------------------------
// موديلات مش بتلتزم بصيغة path="..." (بطيئة الالتزام بالتعليمات): بنستنتج
// الملفات من كتل الكود الطويلة نفسها، بشرط واحد صارم: الرد مفيهوش ولا ملف
// بـ path صريح. كتل الشرح القصيرة بتفضل inline زي ما هي — مفيش أي تغيير
// في سلوك الموديلات الالتزامية (DeepSeek/GLM).
// ---------------------------------------------------------------------------

interface FenceBlock {
  language: string;
  explicitPath: string;
  body: string;
  closed: boolean;
}

/** بيجمع كل كتل الكود في الرد بالترتيب: مقفولة وغير مقفولة (الذيل المقطوع). */
function collectFenceBlocks(content: string): FenceBlock[] {
  const openerRe = /```([a-zA-Z0-9_+\-]*)(?:[ \t]+path="([^"]*)")?[ \t]*\r?\n/g;
  const blocks: FenceBlock[] = [];
  let m: RegExpExecArray | null;
  while ((m = openerRe.exec(content)) !== null) {
    const from = m.index + m[0].length;
    const closeIdx = content.indexOf("```", from);
    const closed = closeIdx !== -1;
    const body = closed ? content.slice(from, closeIdx) : content.slice(from);
    blocks.push({ language: m[1] || "", explicitPath: (m[2] || "").trim(), body, closed });
    if (!closed) break;
    openerRe.lastIndex = closeIdx + 3;
  }
  return blocks;
}

/** مسار افتراضي معبّر حسب لغة/شكل الكتلة — null لو مش قدّر يستنتجه. */
function inferImplicitPath(language: string, body: string): string | null {
  const t = body.trim();
  const lang = language.trim().toLowerCase();
  if (/^\s*\{[\s\S]*"(dependencies|devDependencies|scripts|name)"\s*:/.test(t)) return "package.json";
  if (/<!doctype html|<html[\s>]/i.test(t)) return "index.html";
  if (lang === "xml" && /<svg[\s>]/i.test(t)) return "image.svg";
  const map: Record<string, string> = {
    html: "index.html",
    htm: "index.html",
    css: "styles.css",
    scss: "styles.scss",
    js: "script.js",
    javascript: "script.js",
    mjs: "script.mjs",
    jsx: "App.jsx",
    tsx: "App.tsx",
    ts: "main.ts",
    typescript: "main.ts",
    py: "main.py",
    python: "main.py",
    java: "Main.java",
    kt: "Main.kt",
    php: "index.php",
    cs: "Program.cs",
    cpp: "main.cpp",
    c: "main.c",
    go: "main.go",
    rs: "main.rs",
    rust: "main.rs",
    swift: "Main.swift",
    dart: "main.dart",
    rb: "main.rb",
    sh: "script.sh",
    bash: "script.sh",
    shell: "script.sh",
    vue: "App.vue",
    svelte: "App.svelte",
    sql: "schema.sql",
    svg: "image.svg",
    svgz: "image.svg",
  };
  return map[lang] || null;
}

/**
 * بيرجع مصفوفة بنفس ترتيب collectFenceBlocks، كل عنصر فيه المسار المستنتَج
 * للكتلة (أو null لو الكتلة هتفضل شرحًا). القواعد:
 * - مفيش أي ملف path صريح في الرد (الموديل الالتزامي مش محتاج مساعد).
 * - كتل مرشّحة = كود طويل (8 أسطر و200 حرف، أو 400 حرف على طول) بلغة معروفة.
 * - نتحرّك لو فيه مرشّحين منفصلين أو مرشّح قوي (مستند HTML كامل/package.json).
 * - كتل markdown/text/بدون لغة بتضل نص — هي للشرح.
 */
export function implicitFilePaths(blocks: FenceBlock[]): (string | null)[] {
  const result: (string | null)[] = new Array(blocks.length).fill(null);
  if (blocks.some((b) => b.explicitPath)) return result;
  const candidates: number[] = [];
  let strongCount = 0;
  let totalChars = 0;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const body = b.body.replace(/\n+$/, "");
    if (!body.trim()) continue;
    const lang = b.language.trim().toLowerCase();
    // ذيل مقطوع (غير مقفول) بشرط أدنى عشان ما نسيبش نصف ملف يتبعث للشات
    const minLines = b.closed ? 8 : 4;
    const minChars = b.closed ? 100 : 60;
    const lines = body.split("\n").length;
    const long = (lines >= minLines && body.length >= minChars) || body.length >= (b.closed ? 400 : 200);
    if (!long) continue;
    if (lang && lang !== "text" && lang !== "md" && lang !== "markdown" && lang !== "plain" && lang !== "txt") {
      candidates.push(i);
      totalChars += body.length;
      if (lang === "json" && /"dependencies"|"devDependencies"|"scripts"/.test(body)) strongCount++;
      if (/<!doctype html|<html[\s>]/i.test(body)) strongCount++;
      if ((lang === "tsx" || lang === "jsx") && /^import\s.+from\s+["']react["']/im.test(body)) strongCount++;
    }
  }
  // تفعيل الاستنتاج: (مرشّح قوي واحد يكفي — مستند HTML كامل/package.json/مكوّن React)
  // أو 3 كتل كود، أو كتلتين طويلتين معًا بإجمالي كبير. كتلتين قصاير مش تسليم.
  const trigger = (strongCount >= 1 && candidates.length >= 1) || candidates.length >= 3 || (candidates.length >= 2 && totalChars >= 800);
  if (!trigger) return result;
  const used = new Set<string>();
  for (const i of candidates) {
    const p = inferImplicitPath(blocks[i].language, blocks[i].body);
    if (!p) continue;
    if (used.has(p)) {
      const dot = p.lastIndexOf(".");
      const stem = dot > 0 ? p.slice(0, dot) : p;
      const ext = dot > 0 ? p.slice(dot) : "";
      let n = 2;
      while (used.has(`${stem}-${n}${ext}`)) n++;
      used.add(`${stem}-${n}${ext}`);
      result[i] = `${stem}-${n}${ext}`;
    } else {
      used.add(p);
      result[i] = p;
    }
  }
  return result;
}

export function extractDeliverableFiles(content: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const regex = new RegExp(DELIVERABLE_FENCE_REGEX);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const explicit = (match[2] || "").trim();
    const fileContent = match[3].replace(/\n+$/, "");
    if (!explicit || !fileContent.trim()) continue;
    files.push({ path: explicit.replace(/^\//, "") || "file.txt", content: fileContent });
  }
  // ذيل غير مقفول بمسار صريح (تسليم اتقطع): ملف ناقص يظهر في الكارت مع «كمّل»،
  // ولما التكملة تكمله بيندمج في نفس الملف بدل ما يظهر مكررًا.
  const open = findUnclosedFence(content);
  if (open && open.path && open.body.replace(/\n+$/, "").trim()) {
    files.push({
      path: open.path.replace(/^\//, "") || "file.txt",
      content: open.body.replace(/\n+$/, ""),
    });
  }
  // موديل بيتجاهل صيغة path="..." (بعض Free models): استنتج الملفات من كتل الكود
  // الطويلة نفسها — بس لو الرد مفيهوش ولا ملف صريح (شوف implicitFilePaths).
  if (files.length === 0) {
    const blocks = collectFenceBlocks(content);
    const paths = implicitFilePaths(blocks);
    paths.forEach((p, i) => {
      if (!p) return;
      files.push({ path: p, content: blocks[i].body.replace(/\n+$/, "") });
    });
  }
  return files;
}

export function hasProjectFiles(content: string): boolean {
  return extractDeliverableFiles(content).length > 0;
}

export function isExportableProject(content: string): boolean {
  return extractDeliverableFiles(content).length >= 2;
}

export type ContentSegment =
  | { type: "text"; text: string }
  // path = مسار التسليم الصريح إن وجد (يُخفى من النص ويظهر في الكارت)،
  // وnull لكتل الشرح التوضيحية (تظهر inline في النص).
  | { type: "code"; language: string; code: string; path: string | null };

/** يقسم رسالة كاملة (بعد الحفظ) إلى نص عادي وكتل كود، لعرضها في الشات. */
export function parseMessageContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = new RegExp(GENERIC_FENCE_REGEX);
  const implicit = implicitFilePaths(collectFenceBlocks(content));
  let blockIdx = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.trim()) segments.push({ type: "text", text });
    }
    segments.push({
      type: "code",
      language: match[1] || "text",
      code: match[3].replace(/\n+$/, ""),
      path: (match[2] || "").trim() || implicit[blockIdx] || null,
    });
    blockIdx++;
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const tail = content.slice(lastIndex);
    // ذيل غير مقفول: نحوّله لكتلة كود (التسليم يتخبى في الكارت، والشرح يظهر inline)
    // بدل ما يظهر كنص خام بعلامات ``` في الشات.
    const openMatch = /```([a-zA-Z0-9_+\-]*)(?:[ \t]+path="([^"]*)")?[ \t]*\r?\n/.exec(tail);
    if (openMatch && openMatch.index !== undefined) {
      const before = tail.slice(0, openMatch.index);
      if (before.trim()) segments.push({ type: "text", text: before });
      const code = tail.slice(openMatch.index + openMatch[0].length).replace(/\n+$/, "");
      const fencePath = (openMatch[2] || "").trim() || implicit[blockIdx] || null;
      const looksReal = !!(openMatch[1] || fencePath || code.trim().includes("\n"));
      if (code.trim() && looksReal) {
        segments.push({ type: "code", language: openMatch[1] || "text", code, path: fencePath });
      } else if (code.trim()) {
        segments.push({ type: "text", text: tail });
      }
      // فتحة فاضية بلا محتوى: تُسقط بصمت.
    } else if (tail.trim()) {
      segments.push({ type: "text", text: tail });
    }
  }
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: "text", text: content });
  }
  return segments;
}

export type StreamingSegment =
  | { type: "prose"; text: string }
  | { type: "fileblock"; language: string; path: string; isComplete: boolean; body: string };

/** أثناء البث الحي: كتل التسليم (path صريح) بس هي اللي بتظهر كـ "جاري بناء ملف"
 * في الخلفية — زي Claude وهو بيتبني في بيئته. كتل الشرح التوضيحية (من غير path)
 * بتفضل جوه النص وبتترسم inline أول بأول. */
export function parseStreamingContent(content: string): StreamingSegment[] {
  const segments: StreamingSegment[] = [];
  const regex = /```([a-zA-Z0-9_+\-]*)(?:[ \t]+path="([^"]*)")?[ \t]*\n([\s\S]*?)(```|$)/g;
  const implicit = implicitFilePaths(collectFenceBlocks(content));
  let blockIdx = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [full, lang, explicitPath, body, closer] = match;
    const explicit = (explicitPath || "").trim();
    // موديل بيتجاهل صيغة path: الكتلة الطويلة المستنتَجة تبان "جاري بناء ملف" زي Claude —
    // مش كود شرح في الشات.
    const implicitPath = implicit[blockIdx] || null;
    blockIdx++;
    if (!explicit && !implicitPath) {
      // كتلة شرح بلا path: تفضل جوه النص وتترسم inline — مش ملف.
      // (منحرّكش lastIndex: الـ regex تقدّم والفتحة تتحسب ضمن الـ prose اللي بعدها.)
      continue;
    }
    if (match.index > lastIndex) {
      const proseText = content.slice(lastIndex, match.index);
      if (proseText.trim()) segments.push({ type: "prose", text: proseText });
    }
    segments.push({
      type: "fileblock",
      language: lang || "text",
      path: ((explicit || implicitPath) || "").replace(/^\//, "") || "file.txt",
      isComplete: closer === "```" && body.trim().length > 0,
      body,
    });
    lastIndex = match.index + full.length;
  }
  if (lastIndex < content.length) {
    const rest = content.slice(lastIndex);
    if (rest.trim()) segments.push({ type: "prose", text: rest });
  }
  return segments;
}

/**
 * يدمج الملفات حسب المسار (الأحدث يكسب) — لمنع تكرار نفس الملف في الكروت
 * والمعاينة لو ظهر بأكثر من نسخة في نفس الرد (مثلًا تعديل أداة فوق كتلة مكتوبة).
 */
export function dedupeProjectFiles(files: ProjectFile[]): ProjectFile[] {
  const byPath = new Map<string, ProjectFile>();
  for (const f of files) byPath.set(f.path, f);
  return [...byPath.values()];
}
