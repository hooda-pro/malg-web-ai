"use client";

import { Sparkles, Terminal, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import { useSettings } from "./SettingsContext";

const QUICK_PROMPT_KEYS = ["prompt1", "prompt2", "prompt3", "prompt4"];

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
    <div className="flex h-full flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="animate-float flex h-16 w-16 items-center justify-center rounded-xl border-2 border-green/40 bg-green/10 glow-green">
        <Sparkles size={30} className="text-green" />
      </div>

      <h1 className="animate-slideUp [animation-fill-mode:both] mt-4 text-xl font-bold text-txt">
        {t("heroTitle")}
      </h1>
      <p className="animate-slideUp [animation-fill-mode:both] [animation-delay:80ms] mt-1 text-sm font-medium text-cyan">
        {t("heroSubtitle")}
      </p>

      <div className="animate-slideUp [animation-fill-mode:both] [animation-delay:160ms] mt-3 flex items-center gap-1.5 rounded-full border border-line2 bg-panel2 px-3 py-1.5">
        <Zap size={12} className="text-cyan" />
        <span className="mono text-[11px] text-txt2">{t("balance", { n: formatTokens(totalTokens) })}</span>
      </div>

      <div className="mt-7 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {QUICK_PROMPT_KEYS.map((key, i) => (
          <button
            key={key}
            onClick={() => onPromptSelected(t(key))}
            style={{ animationDelay: `${240 + i * 70}ms` }}
            className="animate-slideUp [animation-fill-mode:both] rounded-md border border-line bg-panel/60 px-3 py-2.5 text-start text-[12.5px] text-txt2 transition hover:border-green/40 hover:text-txt"
          >
            {t(key)}
          </button>
        ))}
      </div>

      <button
        onClick={onOpenRunner}
        style={{ animationDelay: `${240 + QUICK_PROMPT_KEYS.length * 70}ms` }}
        className="animate-slideUp [animation-fill-mode:both] mt-6 flex items-center gap-2 rounded-md border border-line2 px-3 py-1.5 text-[11.5px] text-txt3 hover:border-green/40 hover:text-green"
      >
        <Terminal size={13} /> {t("tryRunner")}
      </button>
    </div>
  );
}
