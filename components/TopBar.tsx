"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Coins, Menu, Sparkles, Terminal, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import type { ModelId } from "./SettingsContext";
import { AVAILABLE_MODELS, useSettings } from "./SettingsContext";

export default function TopBar({
  onToggleDrawer,
  remainingTokens,
  onOpenRunner,
  onOpenRecharge,
  lockedModel,
  onPickModel,
}: {
  onToggleDrawer: () => void;
  remainingTokens: number | null;
  onOpenRunner: () => void;
  /** فتح مودال شحن الرصيد (الباقات + واتساب) */
  onOpenRecharge: () => void;
  /** الموديل اللي الشات الحالي متثبت عليه (لو فيه رسايل اتبعتت فيه بالفعل) */
  lockedModel?: ModelId | null;
  /** اختيار موديل من القايمة — بيتعامل معاه ChatShell (تحديث + تحذير لو الشات متثبت) */
  onPickModel: (id: ModelId) => void;
}) {
  const { t, model } = useSettings();
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
    <header className="safe-top relative z-30 flex items-center justify-between border-b border-line bg-panel/90 px-3 py-2.5 backdrop-blur">
      <button
        onClick={onToggleDrawer}
        className="rounded-md p-1.5 text-txt2 hover:bg-white/5 hover:text-txt lg:hidden"
        title={t("topbarDrawer")}
      >
        <Menu size={18} />
      </button>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/5"
        >
          <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-green/40 bg-green/10">
            <Sparkles size={14} className="text-green" />
            <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full bg-green animate-pulseGreen ring-2 ring-panel" />
          </div>
          <div className="text-start leading-tight">
            <p className="mono text-[13px] font-bold text-txt">mlag AI</p>
            <p className="mono flex items-center gap-0.5 text-[9.5px] text-cyan">
              {currentModel.label}
              <ChevronDown size={10} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </p>
          </div>
        </button>

        {menuOpen && (
          <div className="animate-fadeIn absolute start-0 top-[calc(100%+6px)] z-50 w-64 overflow-hidden rounded-lg border border-line2 bg-panel2 py-1 shadow-xl">
            <p className="px-3 py-1.5 text-[10px] font-medium text-txt3">{t("modelSwitcherTitle")}</p>
            {AVAILABLE_MODELS.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  onPickModel(m.id);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start hover:bg-white/[0.04]"
              >
                <span className="min-w-0">
                  <span className="mono block text-[12.5px] text-txt">{m.label}</span>
                  <span className="block text-[10px] text-txt3">{m.hint}</span>
                </span>
                {m.id === displayModelId && <Check size={14} className="shrink-0 text-green" />}
              </button>
            ))}
            {lockedModel && (
              <p className="border-t border-line2 px-3 pb-1.5 pt-2 text-[10px] leading-relaxed text-txt3">
                {t("modelLockedHint")}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {remainingTokens !== null && (
          <div className="flex items-center gap-1 rounded-full border border-line2 bg-panel2 px-2 py-1">
            <Zap size={11} className="text-cyan" />
            <span className="mono text-[10px] text-txt2">{formatTokens(remainingTokens)}</span>
          </div>
        )}
        <button
          onClick={onOpenRecharge}
          title={t("topbarRecharge")}
          className="flex items-center gap-1 rounded-full border border-amber/40 bg-amber/10 px-2 py-1 text-amber transition-colors hover:bg-amber/20"
        >
          <Coins size={11} />
          <span className="mono text-[10px] font-bold">{t("topbarRechargeShort")}</span>
        </button>
        <button
          onClick={onOpenRunner}
          className="rounded-md p-1.5 text-txt2 hover:bg-white/5 hover:text-green"
          title={t("topbarRunner")}
        >
          <Terminal size={17} />
        </button>
      </div>
    </header>
  );
}
