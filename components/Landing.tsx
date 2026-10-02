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
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-7 text-[15px] font-medium text-accent-ink shadow-accent transition-colors duration-1 ease-soft hover:bg-accent-hover";
const btnGhost =
  "inline-flex h-12 items-center justify-center rounded-full border border-hair-2 px-7 text-[15px] font-medium text-ink transition-colors duration-1 ease-soft hover:bg-surface-2";
const h2 = "text-balance text-[clamp(26px,4vw,38px)] font-semibold leading-tight tracking-display";

export default function Landing() {
  const site = getSiteUrl();
  const curl = `curl ${site}/api/malg/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Write a function that reverses a string"}]}'`;

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
        <section className="mx-auto max-w-6xl px-5 pb-14 pt-16 sm:pt-24">
          <h1 className="max-w-[16ch] text-balance text-[clamp(40px,7.5vw,80px)] font-semibold leading-[1.1] tracking-display">
            من الفكرة إلى مشروع يعمل
          </h1>
          <p className="mt-6 max-w-[48ch] text-pretty text-[clamp(16px,2vw,19px)] leading-8 text-ink-2">
            MALG مساعد ذكي يكتب الكود وينفّذه في بيئة معزولة، ويعرض لك النتيجة مباشرة بجانب المحادثة.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <a href="/#/chat" className={btnPrimary}>
              ابدأ المحادثة
              <ArrowLeft size={17} />
            </a>
            <a href="/#/api" className={btnGhost}>
              الـ API للمطورين
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 sm:pb-32" aria-labelledby="showcase-title">
          <h2 id="showcase-title" className="sr-only">
            عرض توضيحي
          </h2>
          <Showcase />
          <p className="mt-4 text-center text-[13px] text-ink-3">عرض توضيحي لتجربة الاستخدام</p>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 sm:pb-32" aria-labelledby="features-title">
          <div className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
            <div>
              <h2 id="features-title" className={h2}>
                ما الذي يقدّمه MALG
              </h2>
              <p className="mt-4 max-w-[34ch] text-[16px] leading-8 text-ink-2">أدوات متكاملة داخل محادثة واحدة.</p>
            </div>
            <dl className="border-y border-hair">
              {CAPABILITIES.map(({ title, body }, i) => (
                <Reveal
                  key={title}
                  delay={(i % 3) * 60}
                  className="grid gap-1.5 border-hair py-6 sm:grid-cols-[210px_1fr] sm:gap-8 [&:not(:first-child)]:border-t"
                >
                  <dt className="text-[17px] font-semibold">{title}</dt>
                  <dd className="text-[15.5px] leading-8 text-ink-2">{body}</dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 sm:pb-32" aria-labelledby="steps-title">
          <h2 id="steps-title" className={h2}>
            ابدأ في ثلاث خطوات
          </h2>
          <ol className="mt-10 grid border-y border-hair sm:grid-cols-3">
            {STEPS.map(({ title, body }, i) => (
              <Reveal
                as="li"
                key={title}
                delay={i * 90}
                className="border-hair px-0 py-7 sm:px-7 sm:py-9 [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-s sm:[&:not(:first-child)]:border-t-0 sm:first:ps-0"
              >
                <span className="tnum text-[14px] text-ink-3">{i + 1}</span>
                <h3 className="mt-3 text-[18px] font-semibold">{title}</h3>
                <p className="mt-2 text-[15px] leading-7 text-ink-2">{body}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 sm:pb-32" aria-labelledby="api-title">
          <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
            <Reveal>
              <h2 id="api-title" className={h2}>
                للمطورين: استخدم MALG بكامل قدراته
              </h2>
              <p className="mt-4 max-w-[52ch] text-[16px] leading-8 text-ink-2">
                اربط MALG بأدواتك عبر واجهة متوافقة مع OpenAI، مثل Cline وOpenCode، أو داخل أي تطبيق تبنيه.
              </p>

              <div className="mt-7 rounded-2xl border border-accent-line bg-accent-soft">
                <p className="flex items-center gap-2.5 px-5 pt-5 text-[15.5px] font-semibold">
                  <Info size={18} className="shrink-0 text-accent" />
                  ملاحظة: للاستخدام الكامل، استخدم الـ API
                </p>
                <dl className="mt-3 text-[14.5px] leading-7">
                  <div className="border-t border-accent-line px-5 py-4">
                    <dt className="font-semibold">على الموقع</dt>
                    <dd className="mt-1 text-ink-2">
                      يعمل الكود في بيئة معزولة بموارد محدودة، لذلك قد تفشل بعض الأوامر، وقد لا يعمل مشروعك كما يعمل في بيئتك.
                    </dd>
                  </div>
                  <div className="border-t border-accent-line px-5 py-4">
                    <dt className="font-semibold">عبر الـ API</dt>
                    <dd className="mt-1 text-ink-2">
                      تشغّل MALG داخل أداة على جهازك، فتتحكم في بيئة التنفيذ، وتجرّب مشروعك بنفسك، وتحصل على أفضل نتيجة.
                    </dd>
                  </div>
                </dl>
              </div>

              <a href="/#/api" className={`${btnGhost} mt-7`}>
                احصل على مفتاح API
              </a>
            </Reveal>

            <Reveal delay={90} className="overflow-hidden rounded-2xl border border-hair bg-surface-inset">
              <div dir="ltr" className="border-b border-hair px-5 py-3 font-mono text-[12px] text-ink-3">
                POST /api/malg/v1/chat/completions
              </div>
              <pre dir="ltr" className="overflow-x-auto p-5 text-left font-mono text-[12.5px] leading-6 text-ink-2">
                <code>{curl}</code>
              </pre>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-24 sm:pb-32">
          <div className="flex flex-wrap items-center justify-between gap-6 border-t border-hair pt-12">
            <h2 className={h2}>ابدأ مشروعك الأول الآن</h2>
            <a href="/#/chat" className={btnPrimary}>
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
