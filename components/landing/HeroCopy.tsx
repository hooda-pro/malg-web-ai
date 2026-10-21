"use client";

import HeroComposer from "./HeroComposer";
import { useSettings } from "../SettingsContext";

/**
 * نصوص الهيرو كلها عميل عشان تترجم حيًا مع تبديل لغة الموقع
 * (الصفحة نفسها سيرفر كومبوننت فمتقدرش تقرا الإعدادات).
 */
export default function HeroCopy() {
  const { t } = useSettings();
  return (
    <div className="relative mx-auto max-w-6xl px-5 text-center">
      <a
        href="#features"
        className="animate-rise inline-flex items-center gap-2 rounded-full border border-hair bg-surface py-1 pe-3 ps-1 text-[13px] font-medium text-ink-2 shadow-1 transition-colors duration-1 hover:border-hair-2 hover:text-ink"
      >
        <span className="rounded-full bg-accent px-2 py-0.5 text-[11.5px] font-semibold text-accent-ink">
          {t("lpBadge")}
        </span>
        {t("lpBadgeBody")}
      </a>

      <h1
        id="hero-title"
        className="animate-rise mx-auto mt-7 max-w-[16ch] text-balance text-[clamp(40px,7vw,88px)] font-semibold leading-[1.08] tracking-display"
        style={{ animationDelay: "60ms" }}
      >
        {t("lpH1a")} <span className="text-gradient">{t("lpH1b")}</span>
      </h1>

      <p
        className="animate-rise mx-auto mt-6 max-w-[54ch] text-pretty text-[clamp(16px,1.8vw,19px)] leading-8 text-ink-2"
        style={{ animationDelay: "120ms" }}
      >
        {t("lpSub")}
      </p>

      <div className="animate-rise mt-10" style={{ animationDelay: "180ms" }}>
        <HeroComposer />
      </div>

      <p className="mt-6 text-[13px] text-ink-3">{t("lpTrial")}</p>
    </div>
  );
}
