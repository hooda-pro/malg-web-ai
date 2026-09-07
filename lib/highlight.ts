// هايلايتر خفيف من غير أي مكتبة خارجية — بيلوّن التعليقات، النصوص، الأرقام،
// والكلمات المفتاحية الشائعة في أغلب لغات البرمجة. مش parser كامل، بس كفاية
// لإحساس محرر أكواد حقيقي في الواجهة.

const KEYWORDS = new Set(
  `function const let var return if else for while switch case break continue
   class extends new this super import export from default async await try catch
   finally throw typeof instanceof in of null undefined true false void delete
   def class self elif except pass lambda yield with as raise import from is not and or
   fun val var when object interface companion override suspend init package
   public private protected static final abstract void int long double float boolean
   String char byte short struct enum union namespace using include template typename
   SELECT FROM WHERE INSERT INTO VALUES UPDATE DELETE JOIN ON GROUP BY ORDER LIMIT AS
   html head body div span class id style script link meta`
    .split(/\s+/)
    .filter(Boolean)
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ترتيب مهم: تعليقات > نصوص > أرقام > كلمات مفتاحية > الباقي
const TOKEN_REGEX =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

export function highlightCode(code: string): string {
  let out = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(TOKEN_REGEX);

  while ((match = regex.exec(code)) !== null) {
    const [full, comment, str, num, word] = match;
    if (match.index > lastIndex) {
      out += escapeHtml(code.slice(lastIndex, match.index));
    }
    if (comment) {
      out += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
    } else if (str) {
      out += `<span class="tok-string">${escapeHtml(str)}</span>`;
    } else if (num) {
      out += `<span class="tok-number">${escapeHtml(num)}</span>`;
    } else if (word) {
      if (KEYWORDS.has(word)) {
        out += `<span class="tok-keyword">${escapeHtml(word)}</span>`;
      } else {
        out += escapeHtml(word);
      }
    } else {
      out += escapeHtml(full);
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < code.length) {
    out += escapeHtml(code.slice(lastIndex));
  }
  return out;
}
