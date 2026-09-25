"use client";

import { Moon, PanelRight, Settings2, Sparkles, Sun, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import { IconButton } from "./ui/Controls";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function TopBar({
  onToggleDrawer,
  remainingTokens,
  onOpenRunner,
  onOpenSettings,
}: {
  onToggleDrawer: () => void;
  remainingTokens: number | null;
  onOpenRunner: () => void;
  onOpenSettings: () => void;
}) {
  const { t, theme, setTheme } = useSettings();
  const isDark = theme === "dark";

  return (
    <header className="glass sticky top-0 z-nav flex h-14 shrink-0 items-center gap-3 border-b border-hair px-3 sm:px-5">
      <IconButton label={t("topbarDrawer")} onClick={onToggleDrawer} className="lg:hidden">
        <PanelRight size={18} className="flip-rtl" />
      </IconButton>

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-ink shadow-accent">
          <Sparkles size={15} />
          <span className="pulse-dot absolute -bottom-px -end-px h-2.5 w-2.5 rounded-full bg-live ring-2 ring-[var(--ground)]" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-title text-ink">mlag AI</p>
          <p className="truncate text-[11px] tracking-label text-ink-3">v2.3 · web</p>
        </div>
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

