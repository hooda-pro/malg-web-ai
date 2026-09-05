export interface ProjectFile {
  path: string;
  content: string;
}

// ```lang path="relative/path"
// ...content...
// ```
const FILE_BLOCK_REGEX = /```[a-zA-Z0-9_+\-]*\s+path="([^"]+)"\s*\n([\s\S]*?)```/g;

/** يستخرج كل الملفات اللي وصلت بصيغة path="..." من رد المساعد. */
export function extractProjectFiles(content: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  const regex = new RegExp(FILE_BLOCK_REGEX);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const path = match[1].trim().replace(/^\//, "") || "file.txt";
    const fileContent = match[2].replace(/\n+$/, "");
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

/** أثناء البث الحي: يظهر ملفات path="..." كـ "جاري كتابة ملف" بدل نص خام،
 * ويترك باقي الكلام كنص عادي — بالظبط زي parseStreamingContent في التطبيق الأصلي. */
export function parseStreamingContent(content: string): StreamingSegment[] {
  const segments: StreamingSegment[] = [];
  const regex = /```([a-zA-Z0-9_+\-]*)\s+path="([^"]+)"\s*\n([\s\S]*?)(```|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const [full, lang, path, , closer] = match;
    if (match.index > lastIndex) {
      const proseText = content.slice(lastIndex, match.index);
      if (proseText.trim()) segments.push({ type: "prose", text: proseText });
    }
    segments.push({
      type: "fileblock",
      language: lang || "text",
      path,
      isComplete: closer === "```",
    });
    lastIndex = match.index + full.length;
  }
  if (lastIndex < content.length) {
    const rest = content.slice(lastIndex);
    if (rest.trim()) segments.push({ type: "prose", text: rest });
  }
  return segments;
}
