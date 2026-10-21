"use client";

import {
  Code2,
  FileText,
  Globe,
  KeyRound,
  Languages,
  PanelRight,
  PenLine,
  Search,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useSettings } from "../SettingsContext";

// شريط القدرات — كمفاتيح ترجمة بدل النص العربي الثابت.
const MARQUEE = [
  { icon: Code2, labelKey: "mq1" },
  { icon: Globe, labelKey: "mq2" },
  { icon: PenLine, labelKey: "mq3" },
  { icon: FileText, labelKey: "mq4" },
  { icon: PanelRight, labelKey: "mq5" },
  { icon: Languages, labelKey: "mq6" },
  { icon: Search, labelKey: "mq7" },
  { icon: Wand2, labelKey: "mq8" },
  { icon: KeyRound, labelKey: "mq9" },
  { icon: Sparkles, labelKey: "mq10" },
] as const;

export default function MarqueeRow() {
  const { t } = useSettings();
  return (
    <section className="pb-16 sm:pb-24" aria-label={t("lpDo")}>
      <div className="lp-marquee" aria-hidden="true">
        {[0, 1].map((dup) => (
          <div key={dup} className="lp-marquee-track">
            {MARQUEE.map(({ icon: Icon, labelKey }) => (
              <span
                key={labelKey}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-hair bg-surface px-4 py-2 text-[13.5px] font-medium text-ink-2"
              >
                <Icon size={15} className="text-accent" />
                {t(labelKey)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
