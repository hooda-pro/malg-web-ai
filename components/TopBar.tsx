"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Coins, Crown, Lock, PanelLeft, Share2, SquarePen } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import { IconButton, Segmented } from "./ui/Controls";
import { useSettings, type ModelId } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function TopBar({
  onToggleDrawer,
  sidebarCollapsed,
  remainingTokens,
  totalTokens,
  onOpenRecharge,
  onNewChat,
  onShare,
  mode,
  onModeChange,
}: {
  onToggleDrawer: () => void;
  sidebarCollapsed: boolean;
  remainingTokens: number | null;
  totalTokens?: number | null;
  onOpenRecharge: () => void;
  onNewChat: () => void;
  /** مشاركة المحادثة الحالية برابط — null = الزرار مخفي (مؤقت/لا جلسة) */
  onShare?: (() => void) | null;
  /** وضع العرض الحالي للتبديل بين الشات والاستوديو من الشريط العلوي */
  mode: "chat" | "voice";
  onModeChange: (mode: "chat" | "voice") => void;
}) {
  const { t } = useSettings();

  return (
    <header className="m-topbar glass sticky top-0 z-nav flex h-[calc(3.25rem+env(safe-area-inset-top))] shrink-0 items-center gap-1.5 border-b border-hair ps-[max(0.625rem,env(safe-area-inset-left))] pe-[max(0.625rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] sm:px-4 relative">
      <IconButton
        label={t("toggleSidebar")}
        onClick={onToggleDrawer}
        className={cn(!sidebarCollapsed && "lg:hidden")}
      >
        <PanelLeft size={18} className="flip-rtl" />
      </IconButton>

      {remainingTokens !== null && (
        <TokensBadge
          remainingTokens={remainingTokens}
          totalTokens={totalTokens ?? null}
          onOpenRecharge={onOpenRecharge}
        />
      )}

      <div className="absolute left-1/2 -translate-x-1/2">
        <Segmented<"chat" | "voice">
          size="sm"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "chat", label: t("modeChat") },
            { value: "voice", label: t("modeVoice") },
          ]}
        />
      </div>

      <div className="ms-auto flex items-center gap-1">
        {onShare && (
          <IconButton label={t("shareChat")} onClick={onShare}>
            <Share2 size={17} />
          </IconButton>
        )}
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
      className="relative ms-0.5"
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
        aria-label={t("topbarTokensHint")}
        className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full transition-opacity duration-1 before:absolute before:-inset-2 before:content-[''] hover:opacity-80"
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
          className="animate-materialize glass absolute start-0 top-[calc(100%+8px)] z-modal w-[240px] overflow-hidden rounded-lg border border-hair p-3.5 shadow-3"
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

/** اختيار الموديل — يُستخدم تحت خانة الكتابة (مضغوط، القايمة تفتح لفوق) زي كلود. */
export function ModelPicker({
  lockedModel,
  onPickModel,
  onLockedModel,
  compact,
  dropUp,
}: {
  lockedModel?: ModelId | null;
  onPickModel: (id: ModelId) => void;
  onLockedModel?: (id: ModelId) => void;
  compact?: boolean;
  dropUp?: boolean;
}) {
  const { t, model, models, modelsLoading } = useSettings();
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
  const currentLabel = models.find((m) => m.id === displayId)?.label ?? models[0]?.label ?? displayId;
  // الشات النصي قابل للاختيار — وصفوف الصوت قسم منفصل "قريبًا" (مش قابل للاختيار)
  const pickable = models.filter((m) => !m.comingSoon);
  const soon = models.filter((m) => m.comingSoon);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={modelsLoading}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={modelsLoading ? t("modelsLoading") : undefined}
        className={cn(
          "flex items-center gap-1.5 rounded-full transition-colors duration-1 hover:bg-surface-3",
          compact ? "h-8 px-2.5" : "h-9 px-3",
          modelsLoading && "pointer-events-none opacity-70"
        )}
      >
        {modelsLoading ? (
          <span className="skel inline-block h-5 w-24 rounded-full" aria-hidden="true" />
        ) : (
          <span dir="ltr" className={cn("font-semibold tracking-title text-ink", compact ? "text-[12.5px]" : "text-[15px]")}>{currentLabel}</span>
        )}
        {lockedModel && <Lock size={11} className="text-ink-3" aria-hidden="true" />}
        <ChevronDown
          size={compact ? 12 : 14}
          className={cn("text-ink-3 transition-transform duration-2 ease-soft", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t("modelSwitcherTitle")}
          className={cn(
            "animate-materialize glass absolute start-0 z-modal w-[300px] overflow-hidden rounded-lg border border-hair p-1.5 shadow-3",
            dropUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          )}
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11.5px] font-medium text-ink-3">
            {t("modelSwitcherTitle")}
          </p>
          {pickable.map((m) => {
            const selected = m.id === displayId;
            return (
              <button
                key={m.id}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  if (m.locked) {
                    setOpen(false);
                    onLockedModel?.(m.id);
                    return;
                  }
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
                    {m.recommended && (
                      <span className="rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">
                        {t("modelRecommended")}
                      </span>
                    )}
                    {m.tier === "paid" && (
                      <span
                        className={cn(
                          "flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium",
                          m.locked ? "bg-surface-3 text-ink-3" : "bg-warn-soft text-warn"
                        )}
                        title={m.locked ? t("modelProLockedHint") : undefined}
                      >
                        {m.locked ? <Lock size={10} /> : <Crown size={10} />}
                        {t("modelProBadge")}
                      </span>
                    )}
                  </span>
                  {m.hint ? (
                    <span className="mt-0.5 block text-[12px] leading-5 text-ink-3">{m.hint}</span>
                  ) : null}
                </span>
                <span className="grid h-5 w-5 shrink-0 place-items-center">
                  {selected && <Check size={15} className="text-accent" />}
                </span>
              </button>
            );
          })}
          {soon.length > 0 && (
            <>
              <div className="mx-2.5 my-1 border-t border-hair" aria-hidden="true" />
              <p className="px-2.5 pb-1 pt-1 text-[11.5px] font-medium text-ink-3">{t("voiceSectionLabel")}</p>
              {soon.map((m) => (
                <div
                  key={m.id}
                  aria-disabled="true"
                  className="flex w-full select-none items-center gap-3 rounded-md px-2.5 py-2 text-start opacity-55"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span dir="ltr" className="text-[13.5px] font-medium text-ink-3">
                        {m.label}
                      </span>
                      <span className="rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] font-medium text-ink-3">
                        {t("voiceComingSoon")}
                      </span>
                    </span>
                    {m.hint ? (
                      <span className="mt-0.5 block text-[12px] leading-5 text-ink-3">{m.hint}</span>
                    ) : null}
                  </span>
                  <span className="grid h-5 w-5 shrink-0 place-items-center">
                    <Lock size={13} className="text-ink-3" />
                  </span>
                </div>
              ))}
            </>
          )}
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
