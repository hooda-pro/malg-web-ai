"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Code2,
  Coins,
  Moon,
  PanelRight,
  Settings2,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";
import { formatTokens } from "@/lib/ai";
import { IconButton } from "./ui/Controls";
import type { ModelId } from "./SettingsContext";
import { AVAILABLE_MODELS, useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function TopBar({
  onToggleDrawer,
  remainingTokens,
  onOpenRunner,
  onOpenSettings,
  onOpenRecharge,
  lockedModel,
  onPickModel,
}: {
  onToggleDrawer: () => void;
  remainingTokens: number | null;
  onOpenRunner: () => void;
  onOpenSettings: () => void;
  onOpenRecharge: () => void;
  /** الموديل اللي الشات الحالي متثبت عليه (لو فيه رسايل اتبعتت فيه بالفعل) */
  lockedModel?: ModelId | null;
  /** اختيار موديل من القايمة — بيتعامل معاه ChatShell */
  onPickModel: (id: ModelId) => void;
}) {
  const { t, theme, setTheme, model } = useSettings();
  const isDark = theme === "dark";
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // اقفل القايمة لو المستخدم دوس برا
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // اللي بيتعرض فوق: لو الشات الحالي متثبت على موديل معين، وريه هو ده — مش الاختيار
  // العام المؤقت — عشان الشات يفضل شغال بنفس الموديل لحد ما يتفتح شات جديد.
  const displayModelId = lockedModel ?? model;
  const currentModel = AVAILABLE_MODELS.find((m) => m.id === displayModelId) ?? AVAILABLE_MODELS[0];

  return (
    <header className="glass sticky top-0 z-nav flex h-14 shrink-0 items-center gap-3 border-b border-hair px-3 sm:px-5">
      <IconButton label={t("topbarDrawer")} onClick={onToggleDrawer} className="lg:hidden">
        <PanelRight size={18} className="flip-rtl" />
      </IconButton>

      {/* شعار mlag AI + اختيار الموديل */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 transition-colors duration-1 hover:bg-surface-2"
        >
          <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-ink shadow-accent">
            <Sparkles size={15} />
            <span className="pulse-dot absolute -bottom-px -end-px h-2.5 w-2.5 rounded-full bg-live ring-2 ring-[var(--ground)]" />
          </span>
          <div className="min-w-0 text-start leading-tight">
            <p className="truncate text-[15px] font-semibold tracking-title text-ink">mlag AI</p>
            <p className="tnum flex items-center gap-0.5 truncate text-[11px] tracking-label text-ink-3">
              {currentModel.label}
              <ChevronDown
                size={11}
                className={cn("transition-transform duration-1", menuOpen && "rotate-180")}
              />
            </p>
          </div>
        </button>

        {menuOpen && (
          <div className="animate-materialize absolute start-0 top-[calc(100%+8px)] z-nav w-72 overflow-hidden rounded-lg border border-hair bg-surface py-1.5 shadow-2">
            <p className="px-3.5 py-1.5 text-[11px] font-medium text-ink-3">
              {t("modelSwitcherTitle")}
            </p>
            {AVAILABLE_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onPickModel(m.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-start transition-colors duration-1 hover:bg-surface-3"
              >
                <span className="min-w-0">
                  <span className="tnum block text-[13px] text-ink">{m.label}</span>
                  <span className="block text-[11.5px] text-ink-3">{m.hint}</span>
                </span>
                {m.id === displayModelId && <Check size={15} className="shrink-0 text-accent" />}
              </button>
            ))}
            {lockedModel && (
              <p className="border-t border-hair px-3.5 pb-1 pt-2.5 text-[11px] leading-relaxed text-ink-3">
                {t("modelLockedHint")}
              </p>
            )}
          </div>
        )}
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
