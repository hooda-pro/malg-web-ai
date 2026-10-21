import { getRequestSiteUrl } from "@/lib/site";
import Showcase from "./Showcase";
import LandingHeader from "./landing/LandingHeader";
import HeroCopy from "./landing/HeroCopy";
import MarqueeRow from "./landing/MarqueeRow";
import ShowcaseTitle from "./landing/ShowcaseTitle";
import FeaturesBento from "./landing/FeaturesBento";
import HowItWorks from "./landing/HowItWorks";
import PricingSection from "./landing/PricingSection";
import DeveloperSection from "./landing/DeveloperSection";
import FaqSection from "./landing/FaqSection";
import FinalCta from "./landing/FinalCta";
import LandingFooter from "./landing/LandingFooter";

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

          <HeroCopy />
        </section>

        <MarqueeRow />

        <section className="mx-auto max-w-6xl px-5" aria-labelledby="showcase-title">
          <ShowcaseTitle />
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
