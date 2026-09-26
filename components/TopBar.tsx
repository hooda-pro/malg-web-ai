"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Lock, PanelLeft, SquarePen, SquareTerminal, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import { IconButton } from "./ui/Controls";
import { AVAILABLE_MODELS, useSettings, type ModelId } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function TopBar({
  onToggleDrawer,
  sidebarCollapsed,
  remainingTokens,
  onOpenRunner,
  onOpenRecharge,
  onNewChat,
  lockedModel,
  onPickModel,
}: {
  onToggleDrawer: () => void;
  sidebarCollapsed: boolean;
  remainingTokens: number | null;
  onOpenRunner: () => void;
  onOpenRecharge: () => void;
  onNewChat: () => void;
  /** الموديل اللي الشات الحالي متثبت عليه (لو اتبعت فيه رسايل بالفعل) */
  lockedModel?: ModelId | null;
  onPickModel: (id: ModelId) => void;
}) {
  const { t } = useSettings();

  return (
    <header className="glass sticky top-0 z-nav flex h-14 shrink-0 items-center gap-1.5 border-b border-hair px-2.5 sm:px-4">
      <IconButton
        label={t("toggleSidebar")}
        onClick={onToggleDrawer}
        className={cn(!sidebarCollapsed && "lg:hidden")}
      >
        <PanelLeft size={18} className="flip-rtl" />
      </IconButton>

      <ModelPicker lockedModel={lockedModel} onPickModel={onPickModel} />

      <div className="ms-auto flex items-center gap-1">
        {remainingTokens !== null && (
          <button
            onClick={onOpenRecharge}
            title={t("topbarTokensHint")}
            className={cn(
              "hidden h-8 items-center gap-1.5 rounded-full border border-hair bg-surface px-3",
              "text-ink-2 shadow-1 transition-colors duration-1 hover:border-hair-2 hover:text-ink xs:inline-flex"
            )}
          >
            <Zap size={12} className="text-accent" />
            <span className="tnum text-[12px] font-medium">{formatTokens(remainingTokens)}</span>
          </button>
        )}

        <IconButton label={t("topbarRunner")} onClick={onOpenRunner}>
          <SquareTerminal size={17} />
        </IconButton>

        <IconButton
          label={t("newChat")}
          onClick={onNewChat}
          className={cn(!sidebarCollapsed && "lg:hidden")}
        >
          <SquarePen size={17} />
        </IconButton>
      </div>
    </header>
  );
}

function ModelPicker({
  lockedModel,
  onPickModel,
}: {
  lockedModel?: ModelId | null;
  onPickModel: (id: ModelId) => void;
}) {
  const { t, model } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const displayId = lockedModel ?? model;
  const current = AVAILABLE_MODELS.find((m) => m.id === displayId) ?? AVAILABLE_MODELS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-full px-3 transition-colors duration-1 hover:bg-surface-3"
      >
        <span className="text-[15px] font-semibold tracking-title text-ink">mlag</span>
        <span dir="ltr" className="text-[15px] font-medium tracking-title text-ink-3">
          {current.label.replace("malg-", "")}
        </span>
        {lockedModel && <Lock size={11} className="text-ink-3" aria-hidden="true" />}
        <ChevronDown
          size={14}
          className={cn("text-ink-3 transition-transform duration-2 ease-soft", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("modelSwitcherTitle")}
          className="animate-materialize glass absolute start-0 top-[calc(100%+6px)] z-modal w-[300px] overflow-hidden rounded-lg border border-hair p-1.5 shadow-3"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11.5px] font-medium text-ink-3">
            {t("modelSwitcherTitle")}
          </p>
          {AVAILABLE_MODELS.map((m) => {
            const selected = m.id === displayId;
            return (
              <button
                key={m.id}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onPickModel(m.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-start transition-colors duration-1",
                  selected ? "bg-surface-3" : "hover:bg-surface-3"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span dir="ltr" className="text-[13.5px] font-medium text-ink">
                      {m.label}
                    </span>
                    {m.badgeKey && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">
                        {t(m.badgeKey)}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-ink-3">{t(m.hintKey)}</span>
                </span>
                <span className="grid h-5 w-5 shrink-0 place-items-center">
                  {selected && <Check size={15} className="text-accent" />}
                </span>
              </button>
            );
          })}
          {lockedModel && (
            <p className="mt-1 flex gap-2 border-t border-hair px-2.5 pb-1 pt-2.5 text-[11.5px] leading-5 text-ink-3">
              <Lock size={12} className="mt-1 shrink-0" />
              {t("modelLockedHint")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
