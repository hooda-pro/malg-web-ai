import { Plus } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { useSettings } from "../SettingsContext";

// الأسئلة والأجوبة كمفاتيح ترجمة — تتبدل حيًا مع لغة الموقع.
const FAQ_KEYS = [
  { q: "faqQ1", a: "faqA1" },
  { q: "faqQ2", a: "faqA2" },
  { q: "faqQ3", a: "faqA3" },
  { q: "faqQ4", a: "faqA4" },
  { q: "faqQ5", a: "faqA5" },
  { q: "faqQ6", a: "faqA6" },
] as const;

export default function FaqSection() {
  const { t, lang } = useSettings();
  return (
    <section
      id="faq"
      className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20 sm:py-28"
      aria-labelledby="faq-title"
      dir={lang === "ar" ? "rtl" : "ltr"}
    >
      <SectionHeading id="faq-title" eyebrow={t("faqEyebrow")} title={t("faqTitle")} />
      <div className="mt-12 divide-y divide-hair overflow-hidden rounded-3xl border border-hair bg-surface shadow-1">
        {FAQ_KEYS.map(({ q, a }) => (
          <details key={q} className="faq-details group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15.5px] font-semibold transition-colors duration-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              {t(q)}
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-hair text-ink-2 transition-transform duration-2 ease-soft group-open:rotate-45">
                <Plus size={15} />
              </span>
            </summary>
            <div className="faq-body">
              <div>
                <p className="px-6 pb-5 text-[14.5px] leading-8 text-ink-2">{t(a)}</p>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
