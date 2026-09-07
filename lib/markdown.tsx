import type { ReactNode } from "react";

/**
 * تنسيق Markdown خفيف للرد النهائي (بعد ما يخلص الستريم) — من غير أي مكتبة
 * خارجية، عشان نغطي أكتر حاجة بيكتبها الموديل فعليًا في ردوده:
 * العناوين (# ## ###)، **Bold**، *Italic*، `inline code`، قوائم نقطية/مرقّمة،
 * اقتباس (>)، خط فاصل (---)، وروابط Markdown [نص](رابط).
 *
 * قبل كده كان كل رد بيتعرض كنص خام (whitespace-pre-wrap) من غير أي تنسيق —
 * النجوم والهاشات كانت بتطلع زي ما هي بدل ما تتحول لـ Bold/عناوين حقيقية.
 * الملف ده بيستبدل المستخدم القديم lib/renderInlineLinks.tsx (لسه موجود
 * ومستخدم في عرض الستريم الحي لأسباب أداء/استقرار وقت الكتابة اللحظية).
 */

type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "hr" }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "p"; text: string };

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const UL_RE = /^\s*[-*]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3 | 4, text: heading[2] });
      i++;
      continue;
    }

    if (HR_RE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(lines[i].replace(QUOTE_RE, "$1"));
        i++;
      }
      blocks.push({ type: "quote", text: quoteLines.join("\n") });
      continue;
    }

    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i])) {
        items.push(lines[i].replace(UL_RE, "$1"));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(lines[i].replace(OL_RE, "$1"));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: paraLines.join("\n") });
  }

  return blocks;
}

// ترتيب الأولوية مهم: رابط/كود الأول عشان النجوم اللي جواهم ما تتفسرش كـ Bold غلط
const INLINE_RE =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|_([^_\n]+)_/g;

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(INLINE_RE);

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const [full, linkLabel, linkUrl, code, bold1, bold2, italic1, italic2] = match;
    const key = `${keyPrefix}-i${i++}`;

    if (linkLabel && linkUrl) {
      nodes.push(
        <a
          key={key}
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-cyan underline decoration-cyan/40 underline-offset-2 hover:decoration-cyan"
        >
          {linkLabel}
        </a>
      );
    } else if (code) {
      nodes.push(
        <code key={key} className="mono rounded bg-panel3 px-1 py-0.5 text-[12px] text-amber">
          {code}
        </code>
      );
    } else if (bold1 || bold2) {
      nodes.push(
        <strong key={key} className="font-bold text-txt">
          {bold1 || bold2}
        </strong>
      );
    } else if (italic1 || italic2) {
      nodes.push(
        <em key={key} className="italic text-txt">
          {italic1 || italic2}
        </em>
      );
    } else {
      nodes.push(full);
    }
    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes.length > 0 ? nodes : [text];
}

const HEADING_SIZE: Record<1 | 2 | 3 | 4, string> = {
  1: "text-[16px]",
  2: "text-[14.5px]",
  3: "text-[13.5px]",
  4: "text-[13.5px]",
};

/** بيحوّل نص Markdown كامل لعناصر React منسّقة — استخدمها لأي رد نهائي (مش أثناء الستريم الحي). */
export function renderFormattedText(text: string, keyPrefix: string): ReactNode {
  const blocks = parseBlocks(text);

  return (
    <>
      {blocks.map((block, bi) => {
        const key = `${keyPrefix}-b${bi}`;

        switch (block.type) {
          case "heading":
            return (
              <p
                key={key}
                className={`mb-1 mt-2 font-bold text-txt first:mt-0 ${HEADING_SIZE[block.level]}`}
              >
                {parseInline(block.text, key)}
              </p>
            );
          case "hr":
            return <hr key={key} className="my-2 border-line2" />;
          case "quote":
            return (
              <blockquote
                key={key}
                className="my-1.5 whitespace-pre-wrap border-r-2 border-cyan/40 pr-2 text-[13.5px] leading-6 text-txt2"
              >
                {parseInline(block.text, key)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={key} className="my-1.5 ms-4 list-disc space-y-1">
                {block.items.map((item, ii) => (
                  <li key={`${key}-${ii}`} className="text-[13.5px] leading-6 text-txt">
                    {parseInline(item, `${key}-${ii}`)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="my-1.5 ms-4 list-decimal space-y-1">
                {block.items.map((item, ii) => (
                  <li key={`${key}-${ii}`} className="text-[13.5px] leading-6 text-txt">
                    {parseInline(item, `${key}-${ii}`)}
                  </li>
                ))}
              </ol>
            );
          default:
            return (
              <p key={key} className="whitespace-pre-wrap break-words text-[13.5px] leading-6 text-txt">
                {parseInline(block.text, key)}
              </p>
            );
        }
      })}
    </>
  );
}
