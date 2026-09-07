import type { ReactNode } from "react";

// [نص الرابط](https://...) — بالظبط صيغة الاستشهاد اللي بنطلب من الموديل يستخدمها
// (شوف lib/systemPrompt.ts قسم "Web search") عشان أي مصدر بحث يتحول لرابط حقيقي
// قابل للضغط جوه سياق الكلام، مش نص خام بين قوسين.
const MARKDOWN_LINK_REGEX = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g;

/**
 * بيقسم نص عادي لقطع نص + روابط قابلة للضغط، من غير ما يلمس أي حاجة تانية في
 * الرسالة (مفيش parsing لأي Markdown تاني — العناوين، النجوم، إلخ بتفضل زي ما هي).
 * استخدمها بدل ما تعرض الـ string خام لو الرسالة ممكن تحتوي استشهادات بحث.
 */
export function renderInlineLinks(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(MARKDOWN_LINK_REGEX);
  let i = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [, label, url] = match;
    nodes.push(
      <a
        key={`${keyPrefix}-link-${i++}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-cyan underline decoration-cyan/40 underline-offset-2 hover:decoration-cyan"
      >
        {label}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}
