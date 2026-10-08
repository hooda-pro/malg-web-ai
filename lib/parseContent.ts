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
      path: (match[2] || "").trim() || null,
    });
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
      const fencePath = (openMatch[2] || "").trim() || null;
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
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [full, lang, explicitPath, body, closer] = match;
    const explicit = (explicitPath || "").trim();
    if (!explicit) {
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
      path: explicit.replace(/^\//, "") || "file.txt",
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
