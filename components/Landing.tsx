import { ArrowLeft, Eye, Globe, KeyRound, MessageSquare, Smartphone, Sparkles, Terminal } from "lucide-react";
import { getSiteUrl } from "@/lib/site";

const FEATURES = [
  { icon: MessageSquare, title: "شات فوري بالعربي", body: "الرد بيوصلك وهو بيتكتب، وواجهة RTL مظبوطة من الأساس." },
  { icon: Terminal, title: "بيشغّل الكود بجد", body: "بيكتب الكود وينفّذه في بيئة معزولة، ويوريك كل خطوة عملها." },
  { icon: Eye, title: "معاينة حيّة للمشاريع", body: "الصفحة أو الموقع اللي اتبنى بتشوفه جنب الشات من غير ما تنقل ملفات." },
  { icon: Globe, title: "بحث في الويب", body: "لما سؤالك محتاج معلومة حديثة، بيدوّر ويرجعلك بالنتيجة." },
  { icon: Smartphone, title: "مظبوط على الموبايل", body: "محادثات محفوظة، وثيم فاتح وداكن، وتصدير محادثاتك في أي وقت." },
  { icon: KeyRound, title: "API للمطورين", body: "مفتاح API وendpoint بصيغة متوافقة مع OpenAI تستخدمه في تطبيقاتك." },
];

const STEPS = [
  "سجّل دخولك بحساب جوجل.",
  "اكتب اللي عايز تبنيه أو تسأل عنه.",
  "شوف الخطوات والنتيجة، وكمّل معاه لحد ما يعجبك.",
];

const btnPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-6 text-[14px] font-medium text-accent-ink shadow-accent transition-colors duration-1 ease-soft hover:bg-accent-hover";
const btnGhost =
  "inline-flex h-11 items-center justify-center rounded-full border border-hair-2 px-6 text-[14px] font-medium text-ink transition-colors duration-1 ease-soft hover:bg-surface-2";

export default function Landing() {
  const site = getSiteUrl();
  const curl = `curl ${site}/api/malg/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Write a function that reverses a string"}]}'`;

  return (
    <div className="min-h-[100dvh] bg-ground text-ink">
      <header className="border-b border-hair pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
          <span className="flex items-center gap-2.5 text-[16px] font-semibold tracking-display">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-accent-ink shadow-accent">
              <Sparkles size={18} />
            </span>
            MALG AI
          </span>
          <a href="/#/chat" className={btnPrimary}>
            ابدأ الشات
          </a>
        </div>
      </header>

      <main id="mlag-main">
        <section className="mx-auto max-w-5xl px-5 pb-16 pt-16 text-center sm:pt-24">
          <h1 className="mx-auto max-w-[20ch] text-balance text-[clamp(32px,6vw,56px)] font-semibold leading-[1.2] tracking-display">
            مساعد ذكي بيكتب ويبني ويشغّل الكود جنبك
          </h1>
          <p className="mx-auto mt-5 max-w-[52ch] text-pretty text-[16px] leading-8 text-ink-2">
            MALG AI شات عربي أولًا: تكلّمه، يبني لك المشروع، يشغّله، وتشوف النتيجة قدامك.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="/#/chat" className={btnPrimary}>
              ابدأ الشات
              <ArrowLeft size={16} />
            </a>
            <a href="/#/api" className={btnGhost}>
              API للمطورين
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-16" aria-labelledby="features-title">
          <h2 id="features-title" className="text-[clamp(22px,3.5vw,30px)] font-semibold tracking-display">
            إيه اللي تقدر تعمله
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-hair bg-surface p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={20} />
                </span>
                <h3 className="mt-4 text-[16px] font-semibold">{title}</h3>
                <p className="mt-2 text-[14px] leading-7 text-ink-2">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-16" aria-labelledby="steps-title">
          <h2 id="steps-title" className="text-[clamp(22px,3.5vw,30px)] font-semibold tracking-display">
            تبدأ إزاي
          </h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step} className="flex items-start gap-3 rounded-2xl border border-hair bg-surface p-5">
                <span className="tnum grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-[14px] font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <p className="text-[15px] leading-7">{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-16" aria-labelledby="api-title">
          <div className="rounded-2xl border border-hair bg-surface p-6 sm:p-8">
            <h2 id="api-title" className="text-[clamp(22px,3.5vw,30px)] font-semibold tracking-display">
              للمطورين: API بصيغة OpenAI
            </h2>
            <p className="mt-3 max-w-[60ch] text-[15px] leading-7 text-ink-2">
              اعمل مفتاح من صفحة الـ API وابعت طلباتك من كودك أو من أي أداة بتدعم endpoint متوافق مع OpenAI.
            </p>
            <pre
              dir="ltr"
              className="mt-5 overflow-x-auto rounded-xl bg-surface-inset p-4 text-left font-mono text-[12.5px] leading-6 text-ink-2"
            >
              <code>{curl}</code>
            </pre>
            <a href="/#/api" className={`${btnGhost} mt-5`}>
              افتح صفحة المفاتيح
            </a>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 pb-20 text-center">
          <h2 className="text-balance text-[clamp(24px,4vw,34px)] font-semibold tracking-display">
            جرّب بنفسك دلوقتي
          </h2>
          <a href="/#/chat" className={`${btnPrimary} mt-6`}>
            ابدأ الشات
            <ArrowLeft size={16} />
          </a>
        </section>
      </main>

      <footer className="border-t border-hair py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-[13px] text-ink-3">
        © {new Date().getFullYear()} MALG AI
      </footer>
    </div>
  );
}
