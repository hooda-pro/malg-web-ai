"use client";

import Logo from "../Logo";
import { useSettings } from "../SettingsContext";

// أعمدة اللينكس بمفاتيح ترجمة — تتبدل حيًا مع لغة الموقع.
const COLUMNS = [
  {
    titleKey: "footProd",
    links: [
      { href: "#features", labelKey: "footFeatures" },
      { href: "#how", labelKey: "footHow" },
      { href: "/pricing", labelKey: "footPricing" },
      { href: "/#/chat", labelKey: "footStart" },
    ],
  },
  {
    titleKey: "footDev",
    links: [
      { href: "#developers", labelKey: "footDevApi" },
      { href: "/#/api", labelKey: "footApiKeys" },
      { href: "/models", labelKey: "footModels" },
    ],
  },
  {
    titleKey: "footLegal",
    links: [
      { href: "/privacy", labelKey: "footPrivacy" },
      { href: "/terms", labelKey: "footTerms" },
      { href: "#faq", labelKey: "footFaq" },
    ],
  },
];

export default function LandingFooter() {
  const { t } = useSettings();
  return (
    <footer className="border-t border-hair pb-[max(2rem,env(safe-area-inset-bottom))] pt-14">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-ground">
              <Logo size={18} />
            </span>
            <span className="text-[17px] font-semibold tracking-display">MALG</span>
          </span>
          <p className="mt-4 max-w-[34ch] text-[14px] leading-7 text-ink-2">
            {t("footTagline")}
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.titleKey} aria-label={t(col.titleKey)}>
            <p className="text-[13px] font-semibold text-ink">{t(col.titleKey)}</p>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.href + l.labelKey}>
                  <a href={l.href} className="text-[14px] text-ink-2 transition-colors duration-1 hover:text-ink">
                    {t(l.labelKey)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-hair px-5 pt-6 text-[13px] text-ink-3">
        <span>© {new Date().getFullYear()} MALG. {t("footRights")}</span>
        <span>{t("footMade")}</span>
      </div>
    </footer>
  );
}
