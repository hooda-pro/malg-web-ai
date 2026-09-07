import type { ReactNode } from "react";

/**
 * تنسيق Markdown خفيف للرد النهائي وللبث الحي — من غير أي مكتبة خارجية.
 * بيغطي: العناوين (# ## ###)، **Bold**، *Italic*، ~~Strikethrough~~،
 * `inline code`، قوائم نقطية/مرقّمة (وقوائم تشيك بوكس - [ ] / - [x])،
 * جداول Markdown، اقتباس (>)، خط فاصل (---)، وروابط [نص](رابط).
 *
 * قبل كده كل رد كان بيتعرض كنص خام (whitespace-pre-wrap) — النجوم والهاشات
 * والجداول كانت بتطلع زي ما هي من غير أي تحويل بصري.
 */

type TableBlock = { type: "table"; header: string[]; rows: string[][] };

type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { type: "hr" }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | TableBlock
  | { type: "p"; text: string };

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const HR_RE = /^\s*([-*_])\1{2,}\s*$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const UL_RE = /^\s*[-*]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_ROW_RE = /^\s*\|(.+)\|\s*$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;
const CHECKBOX_RE = /^\[( |x|X)\]\s+(.*)$/;

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

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

    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", header, rows });
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
      !OL_RE.test(lines[i]) &&
      !(TABLE_ROW_RE.test(lines[i]) && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1]))
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
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__|~~([^~\n]+)~~|\*([^*\n]+)\*|_([^_\n]+)_/g;

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(INLINE_RE);

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const [full, linkLabel, linkUrl, code, bold1, bold2, strike, italic1, italic2] = match;
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
    } else if (strike) {
      nodes.push(
        <span key={key} className="text-txt3 line-through">
          {strike}
        </span>
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

function renderListItem(item: string, key: string): ReactNode {
  const checkbox = item.match(CHECKBOX_RE);
  if (checkbox) {
    const checked = checkbox[1].toLowerCase() === "x";
    return (
      <span className={`flex items-start gap-1.5 ${checked ? "text-txt3" : "text-txt"}`}>
        <input type="checkbox" checked={checked} readOnly disabled className="mt-1 accent-cyan" />
        <span className={checked ? "line-through" : ""}>{parseInline(checkbox[2], key)}</span>
      </span>
    );
  }
  return parseInline(item, key);
}

/** بيحوّل نص Markdown كامل لعناصر React منسّقة — يشتغل بأمان مع نص لسه بيتكتب (streaming). */
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
                  <li
                    key={`${key}-${ii}`}
                    className={`text-[13.5px] leading-6 text-txt ${CHECKBOX_RE.test(item) ? "list-none -ms-4" : ""}`}
                  >
                    {renderListItem(item, `${key}-${ii}`)}
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
          case "table":
            return (
              <div key={key} className="my-2 overflow-x-auto rounded-md border border-line2">
                <table className="w-full border-collapse text-[12.5px]">
                  <thead>
                    <tr className="bg-panel3">
                      {block.header.map((cell, ci) => (
                        <th
                          key={`${key}-h${ci}`}
                          className="border-b border-line2 px-2.5 py-1.5 text-start font-bold text-txt"
                        >
                          {parseInline(cell, `${key}-h${ci}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={`${key}-r${ri}`} className={ri % 2 === 1 ? "bg-panel3/40" : ""}>
                        {row.map((cell, ci) => (
                          <td key={`${key}-r${ri}-c${ci}`} className="border-b border-line2/60 px-2.5 py-1.5 text-txt2">
                            {parseInline(cell, `${key}-r${ri}-c${ci}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
