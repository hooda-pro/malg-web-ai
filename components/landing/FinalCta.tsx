import { ArrowLeft } from "lucide-react";
import Logo from "../Logo";

export default function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20 sm:pb-28" aria-labelledby="cta-title">
      <div className="relative overflow-hidden rounded-[32px] bg-ink px-6 py-16 text-center text-ground shadow-3 sm:px-12 sm:py-20">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 start-1/2 h-80 w-[36rem] max-w-full -translate-x-1/2 rounded-full opacity-50 blur-3xl"
          style={{ background: "var(--accent)" }}
        />
        <span aria-hidden="true" className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-ink">
          <Logo size={30} />
        </span>
        <h2 id="cta-title" className="relative mx-auto mt-6 max-w-[20ch] text-balance text-[clamp(30px,4.6vw,52px)] font-semibold leading-[1.15] tracking-display">
          فكرتك التالية تبدأ بسؤال واحد
        </h2>
        <p className="relative mx-auto mt-4 max-w-[46ch] text-[16px] leading-8 opacity-70">
          انضم مجانًا خلال ثوانٍ بحساب Google أو GitHub، وابدأ أول محادثة الآن.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/#/chat"
            className="btn-sheen inline-flex h-12 items-center gap-2 rounded-full bg-accent px-7 text-[15px] font-medium text-accent-ink transition-colors duration-1 hover:bg-accent-hover"
          >
            ابدأ مجانًا
            <ArrowLeft size={17} />
          </a>
          <a
            href="#plans"
            className="inline-flex h-12 items-center rounded-full border px-7 text-[15px] font-medium opacity-80 transition-opacity duration-1 hover:opacity-100"
            style={{ borderColor: "color-mix(in srgb, currentColor 25%, transparent)" }}
          >
            قارن الباقات
          </a>
        </div>
      </div>
    </section>
  );
}
