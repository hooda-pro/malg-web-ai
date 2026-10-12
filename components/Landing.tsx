import { ArrowLeft, Check, Code2, Globe, KeyRound, MessageCircle, PanelRight, Paperclip, PenLine, Zap } from "lucide-react";
import { getSiteUrl } from "@/lib/site";
import { FREE_PLAN, PRO_PLAN, formatUSD } from "@/lib/plans";
import Reveal from "./Reveal";
import Showcase from "./Showcase";
import Logo from "./Logo";

const CAPABILITIES = [
  { icon: MessageCircle, title: "إجابات فورية موثقة", body: "اسأل عن أي شيء — وعند الحاجة يبحث في الويب ويوثّق مصادره بروابط داخل الإجابة." },
  { icon: PenLine, title: "كتابة وصياغة", body: "مقالات ورسائل ومحتوى بأسلوب عربي واضح، مع تدقيق وتحسين ما تكتبه." },
  { icon: Code2, title: "يبني ويشغّل الكود", body: "اطلب موقعًا أو أداة، وشاهد كل أمر يُنفَّذ في بيئة معزولة مع مخرجاته خطوة بخطوة." },
  { icon: PanelRight, title: "معاينة حيّة بجانب المحادثة", body: "الصفحة أو الملفات تُفتح في لوحة عمل، وتتحدث تلقائيًا مع كل رد." },
  { icon: Paperclip, title: "ملفات ومرفقات", body: "ارفع صورًا وملفات مضغوطة، واقرأ منها وناقش محتواها بدل نسخه ولصقه." },
  { icon: KeyRound, title: "API للمطورين", body: "استخدم MALG داخل تطبيقاتك وأدواتك مثل Cline وOpenCode بمفتاح API." },
];

const STEPS = [
  { title: "أنشئ حسابك مجانًا", body: "بحساب Google خلال ثوانٍ — دون بطاقة ائتمانية." },
  { title: "صِف ما تريد", body: "اكتب ما تريد بناءه، أو اسأل عمّا تريد معرفته." },
  { title: "راجع النتيجة", body: "تابع خطوات التنفيذ وشاهد المعاينة، ثم عدّل حتى تصل إلى ما تريد." },
];

const FAQS = [
  {
    q: "هل استخدام MALG مجاني؟",
    a: "نعم. تحصل عند التسجيل على رصيد مجاني يكفي لتجربة المنتج، ويتجدد تلقائيًا بعد النفاد. وإذا احتجت المزيد يمكنك الاشتراك في باقة Pro أو شحن رصيد إضافي.",
  },
  {
    q: "بأي لغة يتحدث MALG؟",
    a: "بالعربية الفصحى افتراضيًا، ويمكنك اختيار العامية المصرية من الإعدادات. كما يدعم الإنجليزية والفرنسية والإسبانية كلغة واجهة وردود.",
  },
  {
    q: "هل يساعدني في البرمجة وبناء المواقع؟",
    a: "نعم — يكتب المواقع والتطبيقات كاملة، وينفّذ الكود في بيئة معزولة، ويعرض النتيجة في معاينة حية بجانب المحادثة.",
  },
  {
    q: "هل يمكنني استخدام MALG داخل أدواتي الخاصة؟",
    a: "نعم، عبر واجهة API متوافقة مع OpenAI تعمل مع أدوات مثل Cline وOpenCode.",
  },
  {
    q: "هل محادثاتي محفوظة؟",
    a: "نعم، تُحفظ محادثاتك على حسابك ويمكنك الرجوع إليها في أي وقت. كما يوجد وضع مؤقت لا يحفظ أي شيء.",
  },
];

const btnPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[14.5px] font-medium text-accent-ink shadow-accent transition-colors duration-1 ease-soft hover:bg-accent-hover";
const btnGhost =
  "inline-flex h-11 items-center justify-center rounded-full border border-hair-2 px-6 text-[14.5px] font-medium text-ink transition-colors duration-1 ease-soft hover:bg-surface-2";
const h2 = "text-balance text-[clamp(22px,3.2vw,30px)] font-semibold leading-tight tracking-display";
const section = "mx-auto max-w-6xl px-5 pb-12 sm:pb-16";
const cell = "bg-surface p-6";

function fmtTokens(n: number): string {
  return `${new Intl.NumberFormat("en-US").format(n)} توكن`;
}

export default function Landing() {
  const site = getSiteUrl();
  const curl = `curl ${site}/api/malg/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello"}]}'`;

  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-contain bg-ground text-ink">
      <header className="sticky top-0 z-sticky border-b border-hair bg-glass pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <span className="flex items-center gap-2">
            <span className="grid place-items-center text-ink">
              <Logo size={26} />
            </span>
            <span className="text-[17px] font-semibold tracking-display">MALG</span>
          </span>
          <nav className="flex items-center gap-1.5">
            <a
              href="#features"
              className="hidden h-10 items-center rounded-full px-4 text-[14px] font-medium text-ink-2 transition-colors duration-1 hover:text-ink md:inline-flex"
            >
              المميزات
            </a>
            <a
              href="#plans"
              className="hidden h-10 items-center rounded-full px-4 text-[14px] font-medium text-ink-2 transition-colors duration-1 hover:text-ink md:inline-flex"
            >
              الأسعار
            </a>
            <a
              href="/#/api"
              className="hidden h-10 items-center rounded-full px-4 text-[14px] font-medium text-ink-2 transition-colors duration-1 hover:text-ink sm:inline-flex"
            >
              الـ API
            </a>
            <a href="/#/chat" className="hidden h-10 items-center rounded-full px-4 text-[14px] font-medium text-ink-2 transition-colors duration-1 hover:text-ink sm:inline-flex">
              تسجيل الدخول
            </a>
            <a href="/#/chat" className={`${btnPrimary} !h-10 !px-5 !text-[14px]`}>
              ابدأ مجانًا
            </a>
          </nav>
        </div>
      </header>

      <main id="mlag-main">
        <section className="relative mx-auto max-w-6xl px-5 pb-10 pt-10 text-center sm:pt-14">
          <div className="aurora" aria-hidden="true">
            <span
              className="aurora-blob left-[6%] top-[-8%] h-72 w-72"
              style={{ background: "var(--aurora-1)" }}
            />
            <span
              className="aurora-blob aurora-blob-b right-[4%] top-[6%] h-80 w-80"
              style={{ background: "var(--aurora-2)" }}
            />
            <span
              className="aurora-blob aurora-blob-c left-[38%] top-[52%] h-64 w-64"
              style={{ background: "var(--aurora-3)" }}
            />
          </div>
          <div className="relative mx-auto mb-7 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink shadow-accent">
            <Logo size={34} />
          </div>
          <p className="relative mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-3.5 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-1">
            <Zap size={13} className="text-accent" />
            مساعد ذكي يتقن العربية
          </p>
          <h1 className="relative mx-auto max-w-[24ch] text-balance text-[clamp(32px,5.2vw,58px)] font-semibold leading-[1.15] tracking-display">
            كل أسئلتك وأعمالك، <span className="text-gradient">في مكان واحد</span>
          </h1>
          <p className="relative mx-auto mt-4 max-w-[58ch] text-pretty text-[clamp(15px,1.7vw,18px)] leading-8 text-ink-2">
            MALG يجيب عن أسئلتك، يكتب معك، يبني المواقع وينفّذ الكود، ويبحث في الويب موثقًا مصادره — بالعربية الفصحى وبلغات أخرى.
          </p>
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href="/#/chat" className={`${btnPrimary} btn-sheen`}>
              ابدأ مجانًا
              <ArrowLeft size={17} />
            </a>
            <a href="#features" className={btnGhost}>
              شاهد المميزات
            </a>
          </div>
          <a
            href="/#/chat"
            className="relative mx-auto mt-6 flex max-w-[560px] items-center gap-3 rounded-2xl border border-hair bg-surface px-5 py-4 text-start shadow-2 transition-colors duration-1 ease-soft hover:border-accent-line"
          >
            <span className="flex-1 truncate text-[14.5px] text-ink-3">اسأل عن أي شيء…</span>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
              <ArrowLeft size={17} />
            </span>
          </a>
          <p className="relative mt-3 text-[13px] text-ink-3">مجاني للبدء — سجّل الدخول بحساب Google فقط</p>
        </section>

        <section className={section} aria-label="أبرز القدرات">
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            {[
              { icon: Zap, label: "شات فوري بالبث الحي" },
              { icon: Globe, label: "بحث الويب بالمصادر" },
              { icon: Code2, label: "بناء الكود وتنفيذه" },
              { icon: KeyRound, label: "واجهة API للمطورين" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-3.5 py-1.5 text-[13px] font-medium text-ink-2 shadow-1"
              >
                <Icon size={14} className="text-accent" />
                {label}
              </span>
            ))}
          </div>
        </section>

        <section className={section} aria-labelledby="showcase-title">
          <h2 id="showcase-title" className="sr-only">
            عرض توضيحي
          </h2>
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-4 -top-8 bottom-0 rounded-[28px] opacity-70 blur-2xl"
              style={{ background: "linear-gradient(180deg, var(--aurora-1), transparent 70%)" }}
            />
            <Showcase />
          </div>
          <p className="mt-3 text-center text-[13px] text-ink-3">عرض توضيحي لتجربة الاستخدام</p>
        </section>

        <section id="features" className={`${section} scroll-mt-20`} aria-labelledby="features-title">
          <h2 id="features-title" className={h2}>
            ماذا يقدم MALG؟
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={(i % 3) * 60} className={`${cell} lift rounded-2xl border border-hair shadow-1`}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={19} />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
                <p className="mt-2 text-[14.5px] leading-7 text-ink-2">{body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className={section} aria-labelledby="steps-title">
          <h2 id="steps-title" className={h2}>
            ابدأ في ثلاث خطوات
          </h2>
          <ol className="mt-6 grid gap-3 sm:grid-cols-3">
            {STEPS.map(({ title, body }, i) => (
              <Reveal as="li" key={title} delay={i * 90} className={`${cell} lift rounded-2xl border border-hair shadow-1`}>
                <h3 className="flex items-center gap-2.5 text-[16px] font-semibold">
                  <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] text-accent">
                    {i + 1}
                  </span>
                  {title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-7 text-ink-2">{body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section id="plans" className={`${section} scroll-mt-20`} aria-labelledby="plans-title">
          <h2 id="plans-title" className={h2}>
            باقة تناسب الجميع
          </h2>
          <p className="mt-3 max-w-[52ch] text-[15.5px] leading-8 text-ink-2">
            ابدأ مجانًا، وعندما تحتاج more انتقل إلى Pro — الاشتراك والشحن من داخل حسابك.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <Reveal className={`${cell} lift rounded-2xl border border-hair shadow-1`}>
              <h3 className="text-[16px] font-semibold">{FREE_PLAN.name}</h3>
              <p className="mt-4">
                <span className="tnum text-[32px] font-semibold tracking-display" dir="ltr">$0</span>
                <span className="text-[14px] text-ink-3"> / للأبد</span>
              </p>
              <ul className="mt-4 space-y-2.5 text-[14.5px] leading-7 text-ink-2">
                <li className="flex items-start gap-2">
                  <Check size={16} className="mt-1.5 shrink-0 text-accent" />
                  {fmtTokens(FREE_PLAN.monthlyTokens)} للتجربة
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} className="mt-1.5 shrink-0 text-accent" />
                  الموديلات المجانية
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} className="mt-1.5 shrink-0 text-accent" />
                  تجديد تلقائي للرصيد الأساسي
                </li>
              </ul>
              <a href="/#/chat" className={`${btnGhost} mt-6 w-full`}>
                ابدأ مجانًا
              </a>
            </Reveal>
            <Reveal delay={90} className="lift overflow-hidden rounded-2xl border border-accent-line bg-surface p-6 shadow-2">
              <h3 className="flex items-center gap-2 text-[16px] font-semibold">
                {PRO_PLAN.name}
                <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">★</span>
              </h3>
              <p className="mt-4">
                <span className="tnum text-[32px] font-semibold tracking-display" dir="ltr">{formatUSD(PRO_PLAN.monthlyUSD ?? 0)}</span>
                <span className="text-[14px] text-ink-3"> / شهريًا</span>
              </p>
              <ul className="mt-4 space-y-2.5 text-[14.5px] leading-7 text-ink-2">
                <li className="flex items-start gap-2">
                  <Check size={16} className="mt-1.5 shrink-0 text-accent" />
                  {fmtTokens(PRO_PLAN.monthlyTokens)} شهريًا
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} className="mt-1.5 shrink-0 text-accent" />
                  كل الموديلات بما فيها المدفوعة
                </li>
                <li className="flex items-start gap-2">
                  <Check size={16} className="mt-1.5 shrink-0 text-accent" />
                  شحن إضافي في أي وقت
                </li>
              </ul>
              <a href="/#/chat" className={`${btnPrimary} mt-6 w-full`}>
                اشترك في Pro
              </a>
            </Reveal>
          </div>
        </section>

        <section className={section} aria-labelledby="api-title">
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-10">
            <Reveal>
              <h2 id="api-title" className={h2}>
                للمطورين: استخدم MALG بكامل قدراته
              </h2>
              <p className="mt-3 max-w-[52ch] text-[15.5px] leading-8 text-ink-2">
                اربط MALG بأدواتك عبر واجهة متوافقة مع OpenAI، مثل Cline وOpenCode، أو داخل أي تطبيق تبنيه.
              </p>
              <a href="/#/api" className={`${btnGhost} mt-5`}>
                احصل على مفتاح API
              </a>
            </Reveal>

            <Reveal delay={90} className="lift overflow-hidden rounded-2xl border border-hair bg-surface-inset">
              <div dir="ltr" className="border-b border-hair px-5 py-3 font-mono text-[12px] text-ink-3">
                POST /api/malg/v1/chat/completions
              </div>
              <pre dir="ltr" className="overflow-x-auto p-5 text-left font-mono text-[13px] leading-7 text-ink-2">
                <code>{curl}</code>
              </pre>
            </Reveal>
          </div>

          <Reveal className="mt-8 overflow-hidden rounded-2xl border border-accent-line bg-accent-soft">
            <p className="flex items-center gap-2.5 px-6 py-4 text-[15.5px] font-semibold">
              ملاحظة: للاستخدام الكامل، استخدم الـ API
            </p>
            <dl className="grid border-t border-accent-line text-[14.5px] leading-7 sm:grid-cols-2">
              <div className="px-6 py-5">
                <dt className="font-semibold">على الموقع</dt>
                <dd className="mt-1 text-ink-2">
                  يعمل الكود في بيئة معزولة بموارد محدودة، لذلك قد تفشل بعض الأوامر، وقد لا يعمل مشروعك كما يعمل في بيئتك.
                </dd>
              </div>
              <div className="border-t border-accent-line px-6 py-5 sm:border-s sm:border-t-0">
                <dt className="font-semibold">عبر الـ API</dt>
                <dd className="mt-1 text-ink-2">
                  تشغّل MALG داخل أداة على جهازك، فتتحكم في بيئة التنفيذ، وتجرّب مشروعك بنفسك، وتحصل على أفضل نتيجة.
                </dd>
              </div>
            </dl>
          </Reveal>
        </section>

        <section id="faq" className={`${section} scroll-mt-20`} aria-labelledby="faq-title">
          <h2 id="faq-title" className={h2}>
            أسئلة شائعة
          </h2>
          <div className="mt-6 space-y-3">
            {FAQS.map(({ q, a }, i) => (
              <Reveal key={q} delay={i * 60}>
                <details className="group rounded-2xl border border-hair bg-surface px-6 py-4 shadow-1">
                  <summary className="cursor-pointer list-none text-[15px] font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center justify-between gap-4">
                      {q}
                      <span className="tnum shrink-0 text-[18px] font-normal text-accent transition-transform duration-2 group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p className="mt-2 text-[14.5px] leading-7 text-ink-2">{a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        <section className={section}>
          <div className="relative flex flex-wrap items-center justify-between gap-5 overflow-hidden rounded-2xl border border-hair bg-surface px-6 py-7 shadow-2 sm:px-8">
            <div className="aurora" aria-hidden="true">
              <span
                className="aurora-blob left-[70%] top-[-60%] h-56 w-56"
                style={{ background: "var(--aurora-1)" }}
              />
              <span
                className="aurora-blob aurora-blob-b left-[4%] top-[10%] h-48 w-48"
                style={{ background: "var(--aurora-2)" }}
              />
            </div>
            <div className="relative">
              <h2 className={h2}>
                ابدأ <span className="text-gradient">مجانًا</span> اليوم
              </h2>
              <p className="mt-2 text-[14.5px] text-ink-2">حساب Google فقط — دون بطاقة ائتمانية.</p>
            </div>
            <a href="/#/chat" className={`${btnPrimary} btn-sheen relative`}>
              ابدأ المحادثة
              <ArrowLeft size={17} />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-hair pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 text-[13px] text-ink-3">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5">
          <span>© {new Date().getFullYear()} MALG</span>
          <nav className="flex gap-5">
            <a href="/#/chat" className="transition-colors duration-1 hover:text-ink">
              المحادثة
            </a>
            <a href="#plans" className="transition-colors duration-1 hover:text-ink">
              الأسعار
            </a>
            <a href="#faq" className="transition-colors duration-1 hover:text-ink">
              الأسئلة الشائعة
            </a>
            <a href="/#/api" className="transition-colors duration-1 hover:text-ink">
              الـ API
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
