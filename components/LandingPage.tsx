"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Code2,
  Copy,
  Eye,
  Globe,
  Info,
  Layers,
  PlugZap,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";


function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible };
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export default function LandingPage() {
  const [copied, setCopied] = useState(false);
  const clineSnippet = `{
  "providers": [{
    "name": "MALG",
    "apiProvider": "openai",
    "openAiBaseUrl": "https://malg.ai/api/malg/v1",
    "openAiApiKey": "malg-... (من #/api)",
    "openAiModelId": "malg-a3"
  }]
}`;

  function copySnippet() {
    navigator.clipboard.writeText(clineSnippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div id="mlag-main" className="min-h-dvh bg-ground text-ink selection:bg-accent selection:text-white">
      <header className="sticky top-0 z-nav border-b border-hair bg-glass backdrop-blur-[20px]">
        <div className="mx-auto flex h-[56px] max-w-[1120px] items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#" className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-surface">
              <Sparkles size={15} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">MALG</span>
            <span className="hidden text-[12px] font-medium text-ink-3 sm:inline">AI</span>
          </a>
          <nav className="hidden items-center gap-6 text-[13.5px] text-ink-2 md:flex">
            <a href="#features" className="hover:text-ink transition-colors">المميزات</a>
            <a href="#how" className="hover:text-ink transition-colors">كيف يعمل</a>
            <a href="#api-note" className="hover:text-ink transition-colors">API للمطورين</a>
          </nav>
          <div className="flex items-center gap-2">
            <a href="#/chat" className="inline-flex h-9 items-center justify-center rounded-full bg-accent px-5 text-[13.5px] font-medium text-white shadow-accent transition hover:bg-accent-hover">
              افتح الشات
              <ArrowLeft size={14} className="ms-1.5 flip-rtl" />
            </a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(800px_400px_at_50%_-10%,rgba(0,113,227,0.08),transparent_70%),radial-gradient(600px_600px_at_90%_20%,rgba(29,158,91,0.06),transparent_70%)]" />
        </div>
        <div className="mx-auto max-w-[1120px] px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:pb-16">
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-hair bg-surface px-3 py-1 text-[12px] font-medium text-ink-2 shadow-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-live" />
              Malg-A3 • بحث حقيقي • تشغيل كود حي
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-6 max-w-[720px] text-balance text-[clamp(32px,6vw,56px)] font-semibold leading-[0.95] tracking-[-0.03em]">
              من الفكرة
              <span className="bg-gradient-to-l from-accent to-[#7aa8ff] bg-clip-text text-transparent"> للمنتج</span>
              <br />
              في محادثة واحدة.
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="mt-5 max-w-[620px] text-pretty text-[16px] leading-7 text-ink-2 sm:text-[17px] sm:leading-8">
              MALG يبني معك: يكتب الكود، يعرضه جنبك مباشرة، يشغّله في بيئة حقيقية، ويبحث لك على الإنترنت — كل ده بسلاسة زجاج آبل.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href="#/chat" className="inline-flex h-[44px] items-center justify-center gap-2 rounded-full bg-accent px-7 text-[14px] font-medium text-white shadow-accent transition hover:bg-accent-hover">
                <Play size={16} className="fill-white" />
                جرّب الآن مجاناً
              </a>
              <a href="#api-note" className="inline-flex h-[44px] items-center justify-center gap-2 rounded-full border border-hair bg-surface px-6 text-[14px] font-medium text-ink shadow-1 transition hover:bg-surface-3">
                للمطورين: شغّل MALG في Cline
                <ArrowUpRight size={15} />
              </a>
            </div>
            <p className="mt-3 text-[12.5px] text-ink-3">100,000 توكن مجاناً عند التسجيل • بدون بطاقة</p>
          </Reveal>
          <div className="relative mt-10 lg:mt-12">
            <Reveal delay={260} className="overflow-hidden rounded-[20px] border border-hair bg-surface shadow-3 sm:rounded-[24px]">
              <div className="flex items-center justify-between border-b border-hair bg-surface-2 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
                  <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                  <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
                </div>
                <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-ink-3">malg.ai • معاينة حيّة</span>
                <span className="hidden text-[11px] text-ink-3 sm:inline">Malg-A3 يبني موقعك الآن…</span>
              </div>
              <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
                <div className="border-b border-hair p-4 sm:p-5 lg:border-b-0 lg:border-e">
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-3 text-ink-2"><Sparkles size={13} /></span>
                      <div className="min-w-0 flex-1 rounded-2xl border border-hair bg-surface-2 px-3.5 py-3">
                        <p className="text-[13px] font-medium text-ink">أبني لي لاندنج لمتجر عطور فاخر — ستايل زجاجي وهادئ</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] text-accent">write_file</span>
                          <span className="rounded-full bg-live-soft px-2.5 py-1 text-[11px] text-live">preview</span>
                          <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] text-ink-3">run_command</span>
                        </div>
                      </div>
                    </div>
                    <div className="ms-10 overflow-hidden rounded-xl border border-hair bg-ink text-[#e7f3ee]">
                      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] text-white/60"><Terminal size={12} /><span dir="ltr" className="font-mono">index.html</span><span className="ms-auto rounded bg-white/10 px-2 py-0.5 font-mono text-[10px]">✓ Ready</span></div>
                      <pre className="overflow-x-auto p-3 font-mono text-[11.5px] leading-6" dir="ltr">{`<section class="hero-glass">
  <h1>Lumiere — عطرك، هويتك</h1>
  <p>زجاج، ضوء، وهدوء.</p>
  <button>تسوق الان</button>
</section>`}</pre>
                    </div>
                    <div className="ms-10 flex items-center gap-2 text-[11px] text-ink-3"><span className="h-2 w-2 rounded-full bg-live" />جاري المعاينة تلقائياً…</div>
                  </div>
                </div>
                <div className="relative bg-gradient-to-br from-[#fbfbfd] to-[#eef2ff] p-4 sm:p-6">
                  <div className="overflow-hidden rounded-2xl border border-hair bg-white shadow-2">
                    <div className="bg-gradient-to-l from-[#0a84ff]/10 to-transparent px-6 py-8 text-center">
                      <p className="text-[11px] font-medium tracking-widest text-accent">LUMIERE</p>
                      <h3 className="mt-2 text-[22px] font-semibold tracking-tight text-ink">عطرك، هويتك</h3>
                      <p className="mt-2 text-[13px] leading-6 text-ink-2">تركيبات فرنسية بلمسة عربية — زجاج نقي وضوء ناعم.</p>
                      <span className="mt-4 inline-flex h-8 items-center rounded-full bg-ink px-5 text-[12px] font-medium text-white">تسوّق الآن</span>
                    </div>
                    <div className="grid grid-cols-3 gap-3 p-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="rounded-xl border border-hair bg-surface-2 p-3">
                          <div className="h-16 rounded-lg bg-gradient-to-br from-accent/10 to-live/10" />
                          <p className="mt-2 text-[11px] font-medium text-ink">عطر {i}</p>
                          <p className="text-[11px] text-ink-3">320 ر.س</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="mt-3 text-center text-[11px] text-ink-3">↑ المعاينة الحيّة تتحدث مع كل سطر كود — كأنها فيديو</p>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
      <section id="features" className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 lg:py-20">
        <Reveal>
          <p className="text-[12px] font-semibold tracking-widest text-accent">لماذا MALG</p>
          <h2 className="mt-2 max-w-[640px] text-[clamp(24px,4vw,36px)] font-semibold leading-tight tracking-tight">كل اللي تحتاجه عشان تبني — في مكان واحد مرتب.</h2>
          <p className="mt-3 max-w-[620px] text-[15px] leading-7 text-ink-2">مش شات نصّي وخلاص. MALG يبني، يعرض، يشغّل، ويبحث — بترتيب يخليك تركز على المنتج مش الأدوات.</p>
        </Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: <Code2 size={18} />, title: "كتابة كود نظيف", desc: "يكتب HTML/CSS/JS وملفات المشروع ككروت قابلة للتحميل فوراً." },
            { icon: <Eye size={18} />, title: "معاينة حيّة جنب الشات", desc: "أي صفحة يبنيها تظهر في لوحة جانبية — جرّب وعدّل بدون نشر." },
            { icon: <Terminal size={18} />, title: "تشغيل أوامر حقيقي", desc: "بيئة E2B معزولة تشغّل npm install/build/test بجد — مش تمثيل." },
            { icon: <Search size={18} />, title: "بحث حقيقي على الإنترنت", desc: "Tavily يجمع مصادر موثوقة ويستشهد بها بروابط مضمّنة." },
            { icon: <Layers size={18} />, title: "محادثات محفوظة", desc: "كل مشروع له سياقه وملفاته — ارجع له أي وقت." },
            { icon: <ShieldCheck size={18} />, title: "آمن ومرتب", desc: "حدود ذكية، حجز رد واحد، وتجديد رصيد تلقائي بعد 30 يوم." },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 70}>
              <div className="group h-full rounded-2xl border border-hair bg-surface p-5 shadow-1 transition hover:-translate-y-1 hover:shadow-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-white">{f.icon}</span>
                <h3 className="mt-4 text-[15px] font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-6 text-ink-2">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>



      <section id="how" className="border-y border-hair bg-surface">
        <div className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 lg:py-20">
          <Reveal><h2 className="text-[clamp(22px,4vw,32px)] font-semibold tracking-tight">كيف يعمل؟ 3 خطوات بس.</h2></Reveal>
          <div className="relative mt-10 grid gap-6 lg:grid-cols-3">
            <div className="pointer-events-none absolute left-6 right-6 top-[28px] hidden h-px bg-gradient-to-r from-transparent via-hair to-transparent lg:block" />
            {[
              { n: "1", title: "أوصف فكرتك", desc: "اكتب بالعربي أو الإنجليزي. ارفع ملفات أو zip لو عندك مشروع قائم.", icon: <Sparkles size={16} /> },
              { n: "2", title: "MALG يبني ويشغّل", desc: "يكتب الملفات، يشغّل الأوامر، ويفتح لك المعاينة تلقائياً.", icon: <Zap size={16} /> },
              { n: "3", title: "عدّل وانشر", desc: "اطلب تعديلات بالكلام — ولما تجهز حمّل الـ zip أو انسخ الكود.", icon: <Globe size={16} /> },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 100}>
                <div className="relative rounded-2xl border border-hair bg-ground p-6">
                  <span className="absolute -top-3 right-6 grid h-7 w-7 place-items-center rounded-full bg-ink text-[12px] font-semibold text-white">{s.n}</span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-ink shadow-1">{s.icon}</span>
                  <h3 className="mt-4 text-[15px] font-semibold">{s.title}</h3>
                  <p className="mt-1.5 text-[13.5px] leading-6 text-ink-2">{s.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={200}>
            <div className="mt-10 flex flex-wrap gap-3">
              <a href="#/chat" className="inline-flex h-10 items-center rounded-full bg-ink px-6 text-[13.5px] font-medium text-white hover:bg-ink/90">ابدأ محادثة الآن</a>
              <a href="#api-note" className="inline-flex h-10 items-center rounded-full border border-hair bg-surface px-6 text-[13.5px] font-medium">أو استخدم الـ API كمحترف</a>
            </div>
          </Reveal>
        </div>
      </section>
      <section id="api-note" className="mx-auto max-w-[1120px] px-4 py-14 sm:px-6 lg:py-20">
        <Reveal>
          <div className="overflow-hidden rounded-[24px] border border-accent/20 bg-gradient-to-br from-accent-soft via-surface to-live-soft shadow-2">
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-6 sm:p-8 lg:p-9">
                <p className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 text-[11px] font-semibold tracking-widest text-white">
                  <PlugZap size={12} className="text-amber-400" />
                  ملاحظة مهمة للمطورين
                </p>
                <h2 className="mt-4 text-[clamp(20px,3.5vw,28px)] font-semibold leading-tight tracking-tight">
                  عايز كل قوة MALG بدون حدود البيئة؟ استخدم الـ API.
                </h2>
                <p className="mt-3 text-[14px] leading-7 text-ink-2">
                  البيئة داخل الموقع (المعاينة الحية و{" "}
                  <span dir="ltr" className="font-mono text-[12px]">
                    run_command
                  </span>
                  ) رائعة للتجربة السريعة، لكن أوامر ثقيلة مثل{" "}
                  <span dir="ltr" className="font-mono text-[12px]">
                    npm install
                  </span>{" "}
                  قد تفشل بسبب حدود الرام/الوقت في الساندبوكس. لو تريد تجربة احترافية كاملة — شغّل MALG كـ API داخل أدواتك:
                </p>
                <div className="mt-5 flex flex-wrap gap-2 text-[12px]">
                  {["Cline", "OpenCode", "Codex CLI", "Claude Code", "Cursor", "Windsurf"].map((x) => (
                    <span key={x} className="rounded-full border border-hair bg-surface px-3 py-1.5 font-medium">
                      {x}
                    </span>
                  ))}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <a
                    href="#/api"
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-6 text-[13.5px] font-medium text-white hover:bg-accent-hover"
                  >
                    أنشئ مفتاح API
                    <ArrowUpRight size={14} />
                  </a>
                  <a
                    href="#/chat"
                    className="inline-flex h-10 items-center rounded-full border border-hair bg-surface px-6 text-[13.5px] font-medium"
                  >
                    جرّب داخل الموقع أولاً
                  </a>
                </div>
                <p className="mt-4 flex gap-2 text-[12.5px] leading-6 text-ink-3">
                  <Info size={14} className="mt-1 shrink-0" />
                  <span>
                    داخل Cline/OpenCode ستستفيد من كل قدرات الملفات والأوامر على جهازك المحلي — لا حدود للبيئة، وأداء
                    أسرع بكثير للمشاريع الكبيرة.
                  </span>
                </p>
              </div>
              <div className="border-t border-hair bg-ink p-6 sm:p-7 lg:border-s lg:border-t-0">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-medium tracking-widest text-white/60">CLINE CONFIG • MALG API</p>
                  <button
                    onClick={copySnippet}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/15"
                  >
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? "اتنسخ" : "انسخ"}
                  </button>
                </div>
                <pre
                  dir="ltr"
                  className="mt-4 overflow-auto rounded-xl bg-white/[0.06] p-4 font-mono text-[11.5px] leading-6 text-white/90"
                >
                  {clineSnippet}
                </pre>
                <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                  <p className="flex items-center gap-2 text-[12px] font-medium text-white">
                    <Check size={14} className="text-[#00ff9d]" />
                    متوافق مع OpenAI
                  </p>
                  <p className="mt-1 text-[12px] leading-6 text-white/60">
                    غيّر <span className="font-mono">baseUrl</span> فقط — كل SDKs اللي تدعم OpenAI ستعمل فوراً.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
      <section className="border-y border-hair bg-surface">
        <div className="mx-auto grid max-w-[1120px] grid-cols-3 divide-x divide-hair divide-x-reverse px-4 sm:px-6">
          {[
            { k: "Malg-A3", v: "موديل واحد قوي" },
            { k: "100K", v: "توكن مجاناً" },
            { k: "∞", v: "محادثات محفوظة" },
          ].map((s) => (
            <div key={s.k} className="py-8 text-center">
              <p className="text-[22px] font-semibold tracking-tight">{s.k}</p>
              <p className="mt-1 text-[12.5px] text-ink-3">{s.v}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5 text-[13px] text-ink-3">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-white">
              <Sparkles size={12} />
            </span>
            MALG AI © {new Date().getFullYear()} — يبني معك، لا يبني بدالك.
          </div>
          <div className="flex flex-wrap gap-4 text-[13px] text-ink-2">
            <a href="#/api" className="hover:text-ink">
              API
            </a>
            <a href="#/chat" className="hover:text-ink">
              الشات
            </a>
            <a href="mailto:support@malg.ai" className="hover:text-ink">
              الدعم
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

