export interface ProjectFile {
  path: string;
  content: string;
}

// ```lang path="relative/path"   (أو كتلة كود عادية من غير path — بتتحول لملف تلقائيًا)
// ...content...
// ```
const ANY_FENCE_REGEX = /```([a-zA-Z0-9_+\-]*)(?:[ \t]+path="([^"]*)")?[ \t]*\n([\s\S]*?)```/g;

/** أسماء قاعدة ذكية حسب اللغة — عشان أي كود inline يتحول لملف باسم معقول. */
const LANG_BASE: Record<string, string> = {
  html: "index", htm: "index", css: "style", js: "script", javascript: "script",
  jsx: "App", ts: "main", typescript: "main", tsx: "App", py: "main", python: "main",
  java: "Main", kt: "Main", kotlin: "Main", c: "main", cpp: "main", "c++": "main",
  cs: "Program", csharp: "Program", php: "index", go: "main", rs: "main", rust: "main",
  rb: "main", ruby: "main", swift: "main", sh: "script", bash: "script", zsh: "script",
  sql: "query", json: "data", xml: "data", yaml: "config", yml: "config",
  md: "README", markdown: "README", txt: "file", text: "file",
};

function autoFileName(lang: string, used: Map<string, number>): string {
  const l = (lang || "").toLowerCase();
  const base = LANG_BASE[l] ?? "file";
  const ext = l && /^[a-z0-9+]+$/.test(l) ? l : "txt";
  const key = `${base}.${ext}`;
  const n = used.get(key) ?? 0;
  used.set(key, n + 1);
  return n === 0 ? key : `${base}-${n + 1}.${ext}`;
}

/** يستخرج كل كتل الكود كملفات: اللي عليها path بياخده، واللي من غيره بيتسمى تلقائيًا.
 * ده بيضمن إن أي كود يكتبه الموديل عمره ما يظهر كنص في الشات — دايمًا ملف. */
export function extractProjectFiles(content: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const used = new Map<string, number>();
  const regex = new RegExp(ANY_FENCE_REGEX);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const lang = match[1] || "";
    const explicit = (match[2] || "").trim();
    const fileContent = match[3].replace(/\n+$/, "");
    if (!fileContent.trim()) continue;
    const path = explicit ? explicit.replace(/^\//, "") || "file.txt" : autoFileName(lang, used);
    files.push({ path, content: fileContent });
  }
  return files;
}

export function hasProjectFiles(content: string): boolean {
  return extractProjectFiles(content).length > 0;
}

export function isExportableProject(content: string): boolean {
  return extractProjectFiles(content).length >= 2;
}

export type ContentSegment =
  | { type: "text"; text: string }
  | { type: "code"; language: string; code: string };

// أي كتلة كود عامة (بـ path أو من غيره)
const GENERIC_FENCE_REGEX = /```([a-zA-Z0-9_+\-]*)(?:\s+path="[^"]*")?\s*\n([\s\S]*?)```/g;

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
      code: match[2].replace(/\n+$/, ""),
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text.trim()) segments.push({ type: "text", text });
  }
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: "text", text: content });
  }
  return segments;
}

export type StreamingSegment =
  | { type: "prose"; text: string }
  | { type: "fileblock"; language: string; path: string; isComplete: boolean };

/** أثناء البث الحي: أي كتلة كود (بـ path أو من غيره) بتظهر كـ "جاري بناء ملف" في الخلفية
 * بدل نص خام — الكود عمره ما يترسم في الشات، بالظبط زي Claude وهو بيتبني في بيئته. */
export function parseStreamingContent(content: string): StreamingSegment[] {
  const segments: StreamingSegment[] = [];
  const used = new Map<string, number>();
  const regex = /```([a-zA-Z0-9_+\-]*)(?:[ \t]+path="([^"]*)")?[ \t]*\n([\s\S]*?)(```|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [full, lang, explicitPath, body, closer] = match;
    if (match.index > lastIndex) {
      const proseText = content.slice(lastIndex, match.index);
      if (proseText.trim()) segments.push({ type: "prose", text: proseText });
    }
    const explicit = (explicitPath || "").trim();
    const path = explicit ? explicit.replace(/^\//, "") || "file.txt" : autoFileName(lang || "", used);
    segments.push({
      type: "fileblock",
      language: lang || "text",
      path,
      isComplete: closer === "```" && body.trim().length > 0,
    });
    lastIndex = match.index + full.length;
  }
  if (lastIndex < content.length) {
    const rest = content.slice(lastIndex);
    if (rest.trim()) segments.push({ type: "prose", text: rest });
  }
  return segments;
}
