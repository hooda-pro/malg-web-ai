import { ArrowLeft, Info } from "lucide-react";
import { getSiteUrl } from "@/lib/site";
import Reveal from "./Reveal";
import Showcase from "./Showcase";

const CAPABILITIES = [
  { title: "محادثة عربية فورية", body: "تصلك الردود أثناء كتابتها، بواجهة تدعم الاتجاه من اليمين إلى اليسار بالكامل." },
  { title: "تنفيذ الكود", body: "يكتب الكود ويشغّله في بيئة معزولة، ويعرض لك كل خطوة نفّذها." },
  { title: "معاينة مباشرة", body: "تظهر الصفحة أو الموقع الذي أُنشئ بجانب المحادثة، دون نقل أي ملفات." },
  { title: "بحث في الويب", body: "يبحث عن المعلومات الحديثة عند الحاجة، ويضمّنها في إجابته." },
  { title: "على كل أجهزتك", body: "محادثات محفوظة، ووضع فاتح وداكن، وتصدير للمحادثات في أي وقت." },
  { title: "واجهة API متوافقة مع OpenAI", body: "استخدم MALG داخل تطبيقاتك وأدواتك باستخدام مفتاح API." },
];

const STEPS = [
  { title: "سجّل الدخول", body: "بحساب Google خلال ثوانٍ." },
  { title: "صِف ما تريد", body: "اكتب ما تريد بناءه، أو اسأل عمّا تريد معرفته." },
  { title: "راجع النتيجة", body: "تابع خطوات التنفيذ وشاهد المعاينة، ثم عدّل حتى تصل إلى ما تريد." },
];

const btnPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[14.5px] font-medium text-accent-ink shadow-accent transition-colors duration-1 ease-soft hover:bg-accent-hover";
const btnGhost =
  "inline-flex h-11 items-center justify-center rounded-full border border-hair-2 px-6 text-[14.5px] font-medium text-ink transition-colors duration-1 ease-soft hover:bg-surface-2";
const h2 = "text-balance text-[clamp(22px,3.2vw,30px)] font-semibold leading-tight tracking-display";
const section = "mx-auto max-w-6xl px-5 pb-12 sm:pb-16";
const cell = "bg-surface p-6";

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
          <span className="text-[17px] font-semibold tracking-display">MALG</span>
          <nav className="flex items-center gap-1.5">
            <a
              href="/#/api"
              className="hidden h-10 items-center rounded-full px-4 text-[14px] font-medium text-ink-2 transition-colors duration-1 hover:text-ink sm:inline-flex"
            >
              الـ API
            </a>
            <a href="/#/chat" className={`${btnPrimary} !h-10 !px-5 !text-[14px]`}>
              ابدأ المحادثة
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
          <h1 className="relative mx-auto max-w-[24ch] text-balance text-[clamp(32px,5.2vw,58px)] font-semibold leading-[1.15] tracking-display">
            من الفكرة إلى <span className="text-gradient">مشروع يعمل</span>
          </h1>
          <p className="relative mx-auto mt-4 max-w-[58ch] text-pretty text-[clamp(15px,1.7vw,18px)] leading-8 text-ink-2">
            MALG مساعد ذكي يكتب الكود وينفّذه في بيئة معزولة، ويعرض لك النتيجة مباشرة بجانب المحادثة.
          </p>
          <div className="relative mt-6 flex flex-wrap items-center justify-center gap-3">
            <a href="/#/chat" className={`${btnPrimary} btn-sheen`}>
              ابدأ المحادثة
              <ArrowLeft size={17} />
            </a>
            <a href="/#/api" className={btnGhost}>
              الـ API للمطورين
            </a>
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

        <section className={section} aria-labelledby="features-title">
          <h2 id="features-title" className={h2}>
            ما الذي يقدّمه MALG
          </h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map(({ title, body }, i) => (
              <Reveal key={title} delay={(i % 3) * 60} className={`${cell} lift rounded-2xl border border-hair shadow-1`}>
                <h3 className="text-[16px] font-semibold">{title}</h3>
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
              <Info size={18} className="shrink-0 text-accent" />
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
            <h2 className={`${h2} relative`}>
              ابدأ <span className="text-gradient">مشروعك الأول</span> الآن
            </h2>
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
            <a href="/#/api" className="transition-colors duration-1 hover:text-ink">
              الـ API
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
