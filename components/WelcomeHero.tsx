"use client";

import { ArrowUpLeft, Play, Sparkles, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import { useSettings } from "./SettingsContext";

const QUICK_PROMPT_KEYS = ["prompt1", "prompt2", "prompt3", "prompt4"] as const;

export default function WelcomeHero({
  totalTokens,
  onPromptSelected,
  onOpenRunner,
}: {
  totalTokens: number;
  onPromptSelected: (prompt: string) => void;
  onOpenRunner: () => void;
}) {
  const { t } = useSettings();

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-5 pb-6 pt-10">
      <div className="stagger flex w-full max-w-[680px] flex-col items-center text-center">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-ink shadow-accent">
          <Sparkles size={22} />
        </span>

        <h1 className="mt-6 text-balance text-[clamp(28px,5.2vw,40px)] font-semibold leading-[1.1] tracking-display text-ink">
          {t("heroTitle")}
        </h1>
        <p className="mt-3 max-w-[46ch] text-pretty text-[15.5px] leading-7 text-ink-2">
          {t("heroSubtitle")}
        </p>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-hair bg-surface px-3.5 py-1.5 text-ink-2 shadow-1">
          <Zap size={13} className="text-accent" />
          <span className="tnum text-[12.5px] font-medium">
            {t("balanceShort", { n: formatTokens(totalTokens) })}
          </span>
        </div>

        {/* ONE panel + hairline dividers instead of four floating cards */}
        <div className="mt-10 w-full overflow-hidden rounded-lg border border-hair bg-surface text-start shadow-1">
          <ul className="grid sm:grid-cols-2">
            {QUICK_PROMPT_KEYS.map((key, i) => (
              <li
                key={key}
                className={
                  "border-b border-hair last:border-b-0 " +
                  (i % 2 === 0 ? "sm:border-e sm:border-b-0" : "") +
                  (i >= 2 ? "sm:border-b-0" : "")
                }
              >
                <button
                  onClick={() => onPromptSelected(t(key))}
                  className="group flex w-full items-center gap-3 px-4 py-3.5 text-start transition-colors duration-1 hover:bg-surface-3"
                >
                  <span className="min-w-0 flex-1 text-pretty text-[13.5px] leading-6 text-ink-2 transition-colors duration-1 group-hover:text-ink">
                    {t(key)}
                  </span>
                  <ArrowUpLeft
                    size={14}
                    className="shrink-0 text-ink-3 transition-all duration-1 group-hover:-translate-y-0.5 group-hover:text-accent"
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={onOpenRunner}
          className="mt-6 inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
        >
          <Play size={13} />
          {t("tryRunner")}
        </button>
      </div>
    </div>
  );
}
