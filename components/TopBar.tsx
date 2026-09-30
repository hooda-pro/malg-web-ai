"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Coins, Lock, PanelLeft, SquarePen } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import { IconButton } from "./ui/Controls";
import { AVAILABLE_MODELS, useSettings, type ModelId } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function TopBar({
  onToggleDrawer,
  sidebarCollapsed,
  remainingTokens,
  totalTokens,
  onOpenRecharge,
  onNewChat,
  lockedModel,
  onPickModel,
}: {
  onToggleDrawer: () => void;
  sidebarCollapsed: boolean;
  remainingTokens: number | null;
  totalTokens?: number | null;
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

      {remainingTokens !== null && (
        <TokensBadge
          remainingTokens={remainingTokens}
          totalTokens={totalTokens ?? null}
          onOpenRecharge={onOpenRecharge}
        />
      )}

      <div className="ms-auto flex items-center gap-1">
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

/**
 * دائرة صغيرة جدًا (زي أيقونة نموذج مصغّرة) جنب اسم الموديل مباشرة، بتعرض
 * نسبة استهلاك التوكنز كـ progress ring. بالضغط عليها (أو الـ hover على
 * الديسكتوب) بتفتح كارت صغير فيه تفاصيل الاستخدام الكاملة.
 */
function TokensBadge({
  remainingTokens,
  totalTokens,
  onOpenRecharge,
}: {
  remainingTokens: number;
  totalTokens: number | null;
  onOpenRecharge: () => void;
}) {
  const { t } = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 200);
  };

  const total = totalTokens && totalTokens > 0 ? totalTokens : null;
  const usedPct = total ? Math.min(100, Math.max(((total - remainingTokens) / total) * 100, 0)) : 0;

  // هندسة الدائرة (progress ring): محيط الدائرة ناقص الجزء المستخدم بيدّي طول القوس الظاهر
  const size = 13;
  const stroke = 1.75;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = useMemo(() => {
    if (!total) return circumference; // لسه محملناش الرصيد — دائرة فاضية
    return circumference * (1 - usedPct / 100);
  }, [circumference, total, usedPct]);
  const ringColor = usedPct >= 90 ? "text-danger" : usedPct >= 70 ? "text-warn" : "text-accent";

  return (
    <div
      className="sm:relative ms-0.5"
      ref={ref}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t("topbarTokensHint")}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition-opacity duration-1 hover:opacity-80"
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-hair-2"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className={cn("transition-[stroke-dashoffset] duration-3 ease-soft", ringColor)}
            stroke="currentColor"
          />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("usageTitle")}
          className="animate-materialize glass absolute top-[calc(100%+8px)] z-modal overflow-hidden rounded-lg border border-hair p-3.5 shadow-3 max-sm:inset-x-3 sm:start-0 sm:w-[240px]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-ink-2">{t("usageTitle")}</span>
            <span className="tnum text-[13px] font-semibold text-ink">
              {t("tokensLeft", { n: formatTokens(remainingTokens) })}
            </span>
          </div>

          {total !== null && (
            <>
              <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-surface-3">
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-3 ease-soft",
                    usedPct >= 90 ? "bg-danger" : "bg-accent"
                  )}
                  style={{ width: `${Math.max(usedPct, 2)}%` }}
                />
              </span>
              <p className="tnum mt-1.5 text-[11.5px] text-ink-3">
                {t("tokensOutOf", { used: formatTokens(total - remainingTokens), total: formatTokens(total) })}
              </p>
            </>
          )}

          <button
            onClick={() => {
              setOpen(false);
              onOpenRecharge();
            }}
            className={cn(
              "mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5",
              "text-[12.5px] font-medium text-accent transition-colors duration-1 hover:bg-accent hover:text-accent-ink"
            )}
          >
            <Coins size={13} />
            {t("menuBuyTokens")}
          </button>
        </div>
      )}
    </div>
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
    <div className="sm:relative" ref={ref}>
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
          className="animate-materialize glass absolute top-[calc(100%+6px)] z-modal overflow-hidden rounded-lg border border-hair p-1.5 shadow-3 max-sm:inset-x-3 sm:start-0 sm:w-[300px]"
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
