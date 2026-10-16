import { Code2, FileText, Globe, KeyRound, Languages, PanelRight, PenLine, Search, Sparkles, Wand2 } from "lucide-react";
import { getRequestSiteUrl } from "@/lib/site";
import Showcase from "./Showcase";
import LandingHeader from "./landing/LandingHeader";
import HeroComposer from "./landing/HeroComposer";
import FeaturesBento from "./landing/FeaturesBento";
import HowItWorks from "./landing/HowItWorks";
import PricingSection from "./landing/PricingSection";
import DeveloperSection from "./landing/DeveloperSection";
import FaqSection from "./landing/FaqSection";
import FinalCta from "./landing/FinalCta";
import LandingFooter from "./landing/LandingFooter";

const MARQUEE = [
  { icon: Code2, label: "بناء المواقع" },
  { icon: Globe, label: "بحث موثّق" },
  { icon: PenLine, label: "كتابة المقالات" },
  { icon: FileText, label: "تلخيص المستندات" },
  { icon: PanelRight, label: "معاينة حيّة" },
  { icon: Languages, label: "ترجمة فورية" },
  { icon: Search, label: "تحليل البيانات" },
  { icon: Wand2, label: "تحسين الصياغة" },
  { icon: KeyRound, label: "واجهة API" },
  { icon: Sparkles, label: "أفكار إبداعية" },
];

function MarqueeRow() {
  return (
    <div className="lp-marquee" aria-hidden="true">
      {[0, 1].map((dup) => (
        <div key={dup} className="lp-marquee-track">
          {MARQUEE.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex shrink-0 items-center gap-2 rounded-full border border-hair bg-surface px-4 py-2 text-[13.5px] font-medium text-ink-2"
            >
              <Icon size={15} className="text-accent" />
              {label}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default async function Landing() {
  const site = await getRequestSiteUrl();

  return (
    <div id="lp-scroll" className="h-[100dvh] overflow-y-auto overscroll-none bg-ground text-ink">
      <LandingHeader />

      <main id="mlag-main">
        <section className="relative -mt-16 overflow-hidden pb-16 pt-32 sm:pb-24 sm:pt-40" aria-labelledby="hero-title">
          <div className="lp-hero-bg" aria-hidden="true">
            <span className="lp-orb start-[8%] top-[10%] h-72 w-72" style={{ background: "var(--aurora-1)" }} />
            <span className="lp-orb end-[6%] top-[22%] h-80 w-80" style={{ background: "var(--accent-soft)", animationDelay: "-7s" }} />
          </div>

          <div className="relative mx-auto max-w-6xl px-5 text-center">
            <a
              href="#features"
              className="animate-rise inline-flex items-center gap-2 rounded-full border border-hair bg-surface py-1 pe-3 ps-1 text-[13px] font-medium text-ink-2 shadow-1 transition-colors duration-1 hover:border-hair-2 hover:text-ink"
            >
              <span className="rounded-full bg-accent px-2 py-0.5 text-[11.5px] font-semibold text-accent-ink">جديد</span>
              وكيل ينفّذ الأكواد ويعرض النتيجة مباشرة
            </a>

            <h1
              id="hero-title"
              className="animate-rise mx-auto mt-7 max-w-[16ch] text-balance text-[clamp(40px,7vw,88px)] font-semibold leading-[1.08] tracking-display"
              style={{ animationDelay: "60ms" }}
            >
              من الفكرة إلى النتيجة، <span className="text-gradient">في محادثة واحدة</span>
            </h1>

            <p
              className="animate-rise mx-auto mt-6 max-w-[54ch] text-pretty text-[clamp(16px,1.8vw,19px)] leading-8 text-ink-2"
              style={{ animationDelay: "120ms" }}
            >
              MALG مساعد ذكاء اصطناعي عربي يكتب ويبحث ويبني المواقع وينفّذ الأكواد — وتشاهد كل خطوة أمامك.
            </p>

            <div className="animate-rise mt-10" style={{ animationDelay: "180ms" }}>
              <HeroComposer />
            </div>

            <p className="mt-6 text-[13px] text-ink-3">مجاني للبدء · بدون بطاقة ائتمانية · تسجيل بحساب Google</p>
          </div>
        </section>

        <section aria-label="ماذا يمكنك أن تفعل" className="pb-16 sm:pb-24">
          <MarqueeRow />
        </section>

        <section className="mx-auto max-w-6xl px-5" aria-labelledby="showcase-title">
          <h2 id="showcase-title" className="sr-only">
            شاهد MALG أثناء العمل
          </h2>
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-[10%] -top-10 bottom-10 rounded-full opacity-80 blur-3xl"
              style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent)" }}
            />
            <div className="relative rounded-[28px] border border-hair bg-surface-2 p-2 shadow-3 sm:p-3">
              <Showcase />
            </div>
          </div>
        </section>

        <FeaturesBento />
        <HowItWorks />
        <PricingSection />
        <DeveloperSection site={site} />
        <FaqSection />
        <FinalCta />
      </main>

      <LandingFooter />
    </div>
  );
}
