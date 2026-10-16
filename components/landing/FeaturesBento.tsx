import { Check, Code2, FileText, Globe, History, KeyRound, Languages, PanelRight, Paperclip, PenLine } from "lucide-react";
import Reveal from "../Reveal";
import SectionHeading from "./SectionHeading";

const card = "lift relative flex flex-col overflow-hidden rounded-3xl border border-hair bg-surface p-6 shadow-1";

function IconBadge({ icon: Icon }: { icon: typeof Globe }) {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent">
      <Icon size={19} />
    </span>
  );
}

function SearchVisual() {
  return (
    <div className="lp-dots mt-6 rounded-2xl border border-hair bg-surface-2 p-4">
      <p className="text-[13.5px] leading-7 text-ink">
        تجاوزت مبيعات السيارات الكهربائية 17 مليون سيارة في 2024
        <sup className="mx-1 inline-grid h-4 min-w-4 place-items-center rounded-full bg-accent-soft px-1 text-[10px] font-semibold text-accent">1</sup>
        مع نمو ملحوظ في الأسواق الآسيوية
        <sup className="mx-1 inline-grid h-4 min-w-4 place-items-center rounded-full bg-accent-soft px-1 text-[10px] font-semibold text-accent">2</sup>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {["iea.org", "reuters.com", "bloomberg.com"].map((s, i) => (
          <span key={s} dir="ltr" className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-2.5 py-1 text-[11.5px] text-ink-2">
            <span className="tnum text-accent">{i + 1}</span>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function CodeVisual() {
  return (
    <div dir="ltr" className="code-surface mt-6 overflow-hidden rounded-2xl border border-hair font-mono text-[12px] leading-6">
      <div className="flex items-center gap-1.5 border-b border-hair px-3 py-2 text-ink-3">
        <span className="h-2 w-2 rounded-full bg-live" />
        sandbox · index.html
      </div>
      <pre className="overflow-hidden px-4 py-3 text-left">
        <code>
          <span className="tok-keyword">const</span> todo = <span className="tok-string">{'"My tasks"'}</span>;{"\n"}
          <span className="tok-keyword">function</span> render() {"{"}
          {"\n"}  list.<span className="tok-keyword">map</span>(add);{"\n"}
          {"}"}
          {"\n"}
          <span className="tok-comment">{"// ✓ build passed, preview ready"}</span>
        </code>
      </pre>
    </div>
  );
}

function PreviewVisual() {
  return (
    <div className="mt-6 grid grid-cols-5 gap-2 rounded-2xl border border-hair bg-surface-2 p-2">
      <div className="col-span-2 space-y-1.5 rounded-xl bg-surface p-2.5">
        <span className="block h-2 w-4/5 rounded-full bg-surface-3" />
        <span className="block h-2 w-3/5 rounded-full bg-surface-3" />
        <span className="block h-2 w-2/3 rounded-full bg-accent-soft" />
      </div>
      <div className="col-span-3 rounded-xl bg-[#f5f5f7] p-2.5">
        <span className="block h-2.5 w-1/2 rounded-full bg-[#1d1d1f]/80" />
        <span className="mt-2 block h-12 rounded-lg bg-white shadow-sm" />
      </div>
    </div>
  );
}

export default function FeaturesBento() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-28" aria-labelledby="features-title">
      <SectionHeading
        id="features-title"
        eyebrow="المميزات"
        title="كل ما تحتاجه، في مساعد واحد"
        body="من سؤال سريع إلى مشروع كامل — MALG يفهم ما تريده ويُنجزه، مع نتائج يمكنك رؤيتها والتحقق منها."
      />

      <div className="mt-12 grid gap-4 md:grid-cols-6">
        <Reveal className={`${card} md:col-span-3`}>
          <IconBadge icon={Globe} />
          <h3 className="mt-5 text-[18px] font-semibold tracking-title">بحث لحظي بمصادر موثّقة</h3>
          <p className="mt-2 text-[14.5px] leading-7 text-ink-2">
            يبحث في الويب عند الحاجة ويضع رابط كل مصدر بجانب المعلومة، لتعرف من أين جاءت الإجابة.
          </p>
          <SearchVisual />
        </Reveal>

        <Reveal delay={80} className={`${card} md:col-span-3`}>
          <IconBadge icon={Code2} />
          <h3 className="mt-5 text-[18px] font-semibold tracking-title">يكتب الكود وينفّذه بنفسه</h3>
          <p className="mt-2 text-[14.5px] leading-7 text-ink-2">
            يبني المواقع والأدوات ويشغّلها في بيئة معزولة، ويتابع الأخطاء ويصلحها قبل أن يسلّمك النتيجة.
          </p>
          <CodeVisual />
        </Reveal>

        <Reveal className={`${card} md:col-span-2`}>
          <IconBadge icon={PanelRight} />
          <h3 className="mt-5 text-[17px] font-semibold tracking-title">معاينة حيّة</h3>
          <p className="mt-2 text-[14.5px] leading-7 text-ink-2">شاهد صفحتك تعمل بجانب المحادثة وتتحدّث مع كل تعديل.</p>
          <PreviewVisual />
        </Reveal>

        <Reveal delay={80} className={`${card} md:col-span-2`}>
          <IconBadge icon={PenLine} />
          <h3 className="mt-5 text-[17px] font-semibold tracking-title">كتابة بعربية سليمة</h3>
          <p className="mt-2 text-[14.5px] leading-7 text-ink-2">مقالات ورسائل وتقارير بأسلوب طبيعي، مع تدقيق لغوي وتحسين لما تكتبه.</p>
          <ul className="mt-6 space-y-2">
            {["تدقيق لغوي ونحوي", "إعادة صياغة بنبرة مختلفة", "تلخيص وترجمة"].map((x) => (
              <li key={x} className="flex items-center gap-2 text-[13.5px] text-ink-2">
                <Check size={15} className="text-live" />
                {x}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={160} className={`${card} md:col-span-2`}>
          <IconBadge icon={Paperclip} />
          <h3 className="mt-5 text-[17px] font-semibold tracking-title">افهم ملفاتك</h3>
          <p className="mt-2 text-[14.5px] leading-7 text-ink-2">ارفع الصور والمستندات والملفات المضغوطة وناقش محتواها مباشرة.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["تقرير.pdf", "صورة.png", "project.zip"].map((f) => (
              <span key={f} className="inline-flex items-center gap-1.5 rounded-lg border border-hair bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-ink-2">
                <FileText size={13} className="text-accent" />
                {f}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal className={`${card} md:col-span-6`}>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { icon: Languages, title: "عربي أولًا، ومتعدد اللغات", body: "فصحى أو عامية مصرية، مع دعم الإنجليزية والفرنسية والإسبانية." },
              { icon: History, title: "محادثاتك محفوظة", body: "ارجع لأي محادثة في أي وقت، أو استخدم الوضع المؤقت الذي لا يحفظ شيئًا." },
              { icon: KeyRound, title: "واجهة برمجية متوافقة", body: "ادمج MALG في أدواتك عبر واجهة متوافقة مع OpenAI." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink">
                  <Icon size={19} />
                </span>
                <div>
                  <h3 className="text-[15.5px] font-semibold">{title}</h3>
                  <p className="mt-1 text-[14px] leading-7 text-ink-2">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
