/**
 * بحث حقيقي في الإنترنت — قدرة فعلية جوه السيرفر، مش مجرد تعليمة للموديل.
 *
 * ليه محتاجينها أصلًا:
 * - موديل malg-2.2 (xKiro/Qwen) مالهوش أي أداة بحث خالص من عنده (زي ما موضح
 *   في lib/ai.ts) — يعني من غير الطبقة دي، بيرد من معرفته القديمة بس ومقدرش
 *   يجيب أي معلومة حديثة أصلًا.
 * - أداة البحث المدمجة في GLM/OpenRouter صندوق أسود: إحنا مش متحكمين في
 *   عدد مرات البحث ولا جودته، والموديل ممكن يكتفي بمرة واحدة سطحية.
 *
 * الحل: طبقة بحث موحدة بنشغلها إحنا بنفسنا قبل ما نكلم أي موديل، بتعمل
 * أكتر من استعلام حقيقي بالتوازي (عمق فعلي)، وبترجع النتائج كـ context
 * جاهز نحقنه في الرسائل — شغال بنفس الكفاءة مع الثلاث موديلات كلهم.
 *
 * مزوّد البحث: Tavily (https://tavily.com) — مبني أصلًا عشان يُستخدم مع
 * وكلاء الذكاء الاصطناعي، وعنده باقة مجانية كافية للتجربة والاستخدام
 * المتوسط. ضيف المفتاح في متغيرات البيئة (شوف .env.example) وهيشتغل
 * تلقائيًا؛ من غيره، الموقع يفضل شغال عادي بس من غير الطبقة الإضافية دي
 * (fail-safe — أي خطأ هنا عمره ما يوقف الرد على المستخدم).
 */

const TAVILY_URL = "https://api.tavily.com/search";

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
}

function getTavilyKeys(): string[] {
  const keys: string[] = [];
  const numberedPattern = /^TAVILY_API_KEYS?_?(\d+)$/i;
  const numbered = Object.keys(process.env)
    .map((name) => {
      const m = name.match(numberedPattern);
      return m ? { name, index: parseInt(m[1], 10) } : null;
    })
    .filter((x): x is { name: string; index: number } => x !== null)
    .sort((a, b) => a.index - b.index);
  for (const entry of numbered) {
    const v = process.env[entry.name];
    if (v && v.trim()) keys.push(v.trim());
  }
  const bulk = process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEYS || "";
  for (const k of bulk.split(/[\n,;]+/)) {
    const trimmed = k.trim();
    if (trimmed) keys.push(trimmed);
  }
  return [...new Set(keys)];
}

let tavilyCursor = 0;

/** هل طبقة البحث العميق مفعّلة أصلًا (فيه مفتاح Tavily متظبط)؟ */
export function isDeepSearchEnabled(): boolean {
  return getTavilyKeys().length > 0;
}

/** بحث واحد حقيقي، بيدور على المفاتيح المتاحة لو أول واحد فشل. */
async function searchOnce(query: string, maxResults = 8): Promise<WebSearchResult[]> {
  const keys = getTavilyKeys();
  if (keys.length === 0) return [];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[(tavilyCursor + i) % keys.length];
    try {
      const res = await fetch(TAVILY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: key,
          query,
          search_depth: "advanced",
          max_results: maxResults,
          include_answer: false,
        }),
      });
      if (!res.ok) {
        // مفتاح فشل (رصيد خلص/غير صالح) — جرب اللي بعده بدل ما توقف البحث كله
        if ([401, 402, 403, 429].includes(res.status)) continue;
        return [];
      }
      const data = (await res.json()) as { results?: { title: string; url: string; content: string }[] };
      tavilyCursor = (tavilyCursor + i + 1) % keys.length;
      return (data.results || []).map((r) => ({
        title: r.title || r.url,
        url: r.url,
        content: (r.content || "").slice(0, 600),
      }));
    } catch {
      continue; // مشكلة شبكة مؤقتة — جرب مفتاح تاني
    }
  }
  return [];
}

/**
 * هل الرسالة تستاهل بحث فعلي؟ — البحث هنا مش الوضع الافتراضي: بيتفعّل بس
 * لو فيه إشارة واضحة إن الرسالة محتاجة معلومة حقيقية "حالية/متغيرة" (سعر،
 * خبر، نتيجة، منصب حالي...) أو المستخدم طلب البحث صراحةً. أي كلام تاني —
 * محادثة عادية، رأي، نصيحة، شرح مفهوم، سؤال شخصي، كود، إبداع — بيتسيب
 * للموديل يرد عليه طبيعي من غير ما يفضح إنه "بيشتغل على مشروعك"/"بيبحث"
 * في بلوك النشاط للمستخدم من غير أي داعي.
 */
export function shouldDeepSearch(userMessage: string): boolean {
  const text = userMessage.trim().toLowerCase();
  if (text.length < 2) return false;

  // طلب صريح إن المستخدم عايز بحث فعلي — دايمًا نبحث
  const explicitSearchRequest =
    /(ابحث|دوّر لي|دور لي|سيرش|search (for|online|the web)|look (it |that )?up|google it|شوف (على|في) النت|شوف على الإنترنت)/i;
  if (explicitSearchRequest.test(text)) return true;

  // إشارات واضحة إن السؤال عن حاجة "حالية/متغيرة" فعلاً (سعر، تاريخ اليوم،
  // حدث جاري، منصب حالي، طقس، نتيجة مباراة...) — دي بس اللي بتستاهل بحث.
  const needsCurrentInfo =
    /(اليوم|النهارده|النهاردة|دلوقتي|حاليًا|حاليا|الآن|دلوقت|احدث|أحدث|آخر أخبار|اخر اخبار|أخبار|اخبار|سعر|أسعار|اسعار|بورصة|عملة|سعر الدولار|سعر الذهب|نتيجة المباراة|نتيجة مباراة|الطقس|طقس النهاردة|مين رئيس|مين وزير|من هو رئيس|latest|current(ly)?|today|right now|breaking news|\bnews\b|stock price|exchange rate|\bweather\b|who is the current|\bscore\b)/i;
  if (needsCurrentInfo.test(text)) return true;

  return false;
}

/**
 * بيقسم رسالة المستخدم لأكتر من استعلام بحث حقيقي عشان يغطي جوانب الموضوع
 * المختلفة (عمق فعلي) بدل استعلام واحد سطحي. تقسيم بسيط بالفواصل/الروابط
 * الشائعة عند المقارنة أو تعدد المطالب.
 */
function buildQueries(userMessage: string): string[] {
  const base = userMessage.trim().slice(0, 300);
  const splitters = /\s+(?:و|ولا|أو|مقابل|vs\.?|versus|and|or)\s+/i;
  const parts = base
    .split(splitters)
    .map((p) => p.trim())
    .filter((p) => p.length > 3);

  if (parts.length >= 2 && parts.length <= 4) {
    return parts.slice(0, 3);
  }
  return [base];
}

export interface DeepSearchOutcome {
  performed: boolean;
  contextBlock: string | null;
}

/**
 * بيعمل البحث العميق الفعلي: أكتر من استعلام بالتوازي، دمج وإزالة تكرار
 * النتائج، وتجهيزها كـ context جاهز يتحط في الرسائل قبل ما نكلم الموديل.
 * آمن تمامًا لو فشل أي حاجة — بيرجع performed:false ومفيش استثناء بيتفلت
 * برا الدالة أبدًا (عشان عمره ما يبوظ الرد العادي على المستخدم).
 */
export async function runDeepSearch(userMessage: string): Promise<DeepSearchOutcome> {
  try {
    if (!isDeepSearchEnabled() || !shouldDeepSearch(userMessage)) {
      return { performed: false, contextBlock: null };
    }

    const queries = buildQueries(userMessage);
    const resultsPerQuery = await Promise.all(queries.map((q) => searchOnce(q, 8)));

    const seen = new Set<string>();
    const merged: WebSearchResult[] = [];
    for (const list of resultsPerQuery) {
      for (const r of list) {
        if (!r.url || seen.has(r.url)) continue;
        seen.add(r.url);
        merged.push(r);
        if (merged.length >= 16) break;
      }
      if (merged.length >= 16) break;
    }

    if (merged.length === 0) {
      return { performed: false, contextBlock: null };
    }

    const today = new Date().toISOString().slice(0, 10);
    const lines = merged.map(
      (r, i) => `${i + 1}. [${r.title}](${r.url})\n${r.content}`
    );

    const contextBlock =
      `نتايج بحث حقيقية في الإنترنت (تاريخ اليوم: ${today}) — استخدمها لو مفيدة للرد على آخر ` +
      `رسالة من المستخدم، واستشهد بالمصدر كرابط Markdown مضمّن في الجملة زي ما اتفقنا في التعليمات ` +
      `(متعملش قسم "مصادر" منفصل). لو النتايج مش متعلقة فعليًا بالسؤال، تجاهلها ورد من معرفتك العادية:\n\n` +
      lines.join("\n\n");

    return { performed: true, contextBlock };
  } catch {
    return { performed: false, contextBlock: null };
  }
}
