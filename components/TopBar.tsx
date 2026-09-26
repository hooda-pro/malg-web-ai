"use client";

import { useState } from "react";
import { Check, Code2, Coins, Moon, PanelRight, Settings2, Sparkles, Sun, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import { IconButton } from "./ui/Controls";
import { AVAILABLE_MODELS, useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function TopBar({
  onToggleDrawer,
  remainingTokens,
  onOpenRunner,
  onOpenSettings,
  onOpenRecharge,
}: {
  onToggleDrawer: () => void;
  remainingTokens: number | null;
  onOpenRunner: () => void;
  onOpenSettings: () => void;
  onOpenRecharge: () => void;
}) {
  const { t, theme, setTheme, model, setModel } = useSettings();
  const [modelOpen, setModelOpen] = useState(false);
  const isDark = theme === "dark";

  return (
    <header className="glass sticky top-0 z-nav flex h-14 shrink-0 items-center gap-3 border-b border-hair px-3 sm:px-5">
      <IconButton label={t("topbarDrawer")} onClick={onToggleDrawer} className="lg:hidden">
        <PanelRight size={18} className="flip-rtl" />
      </IconButton>

      <div className="relative min-w-0">
        <button onClick={() => setModelOpen((open) => !open)} className="flex items-center gap-2.5 rounded-xl px-1 py-0.5 text-start transition-colors hover:bg-surface-2" aria-expanded={modelOpen}>
          <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-ink shadow-accent">
            <Sparkles size={15} />
            <span className="pulse-dot absolute -bottom-px -end-px h-2.5 w-2.5 rounded-full bg-live ring-2 ring-[var(--ground)]" />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-semibold tracking-title text-ink">mlag AI</p>
            <p className="truncate text-[11px] tracking-label text-accent">{model}</p>
          </div>
        </button>
        {modelOpen && <div className="absolute start-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-hair bg-surface p-1.5 shadow-2xl">
          <p className="px-2.5 py-1.5 text-[10px] uppercase tracking-label text-ink-3">{t("modelSwitcherTitle")}</p>
          {AVAILABLE_MODELS.map((item) => <button key={item.id} onClick={() => { setModel(item.id); setModelOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-start hover:bg-surface-2">
            <span><span className="block text-[12px] font-medium text-ink">{item.label}</span><span className="block text-[10px] text-ink-3">{item.hint}</span></span>
            {item.id === model && <Check className="text-accent" />}
          </button>)}
        </div>}
      </div>

      <div className="ms-auto flex items-center gap-1.5">
        {remainingTokens !== null && (
          <div
            title={t("quotaTitle")}
            className={cn(
              "hidden items-center gap-1.5 rounded-full border border-hair bg-surface px-2.5 py-1",
              "text-ink-2 shadow-1 transition-colors hover:border-hair-2 xs:inline-flex"
            )}
          >
            <Zap size={12} className="text-accent" />
            <span className="tnum text-[12px] font-medium">{formatTokens(remainingTokens)}</span>
          </div>
        )}

        <IconButton label={t("topbarRecharge")} onClick={onOpenRecharge}>
          <Coins size={17} />
        </IconButton>

        <a
          href="/#/api"
          title={t("topbarApi")}
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2",
            "transition-colors duration-1 ease-soft hover:bg-surface-2 hover:text-ink"
          )}
        >
          <Code2 size={17} />
        </a>

        <IconButton
          label={t("topbarTheme")}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>

        <IconButton label={t("topbarRunner")} onClick={onOpenRunner}>
          <Zap size={17} />
        </IconButton>

        <IconButton label={t("settingsTitle")} onClick={onOpenSettings}>
          <Settings2 size={17} />
        </IconButton>
      </div>
    </header>
  );
}

