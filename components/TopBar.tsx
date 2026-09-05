"use client";

import { Menu, Sparkles, Terminal, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";

export default function TopBar({
  onToggleDrawer,
  remainingTokens,
  onOpenRunner,
}: {
  onToggleDrawer: () => void;
  remainingTokens: number | null;
  onOpenRunner: () => void;
}) {
  return (
    <header className="flex items-center justify-between border-b border-line bg-panel/90 px-3 py-2.5 backdrop-blur">
      <button onClick={onToggleDrawer} className="rounded-md p-1.5 text-txt2 hover:bg-white/5 hover:text-txt">
        <Menu size={18} />
      </button>

      <div className="flex items-center gap-2">
        <div className="relative flex h-7 w-7 items-center justify-center rounded-md border border-green/40 bg-green/10">
          <Sparkles size={14} className="text-green" />
          <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full bg-green animate-pulseGreen ring-2 ring-panel" />
        </div>
        <div className="text-right leading-tight">
          <p className="mono text-[13px] font-bold text-txt">mlag AI</p>
          <p className="text-[9px] text-txt3">v2.3 · web</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        {remainingTokens !== null && (
          <div className="flex items-center gap-1 rounded-full border border-line2 bg-panel2 px-2 py-1">
            <Zap size={11} className="text-cyan" />
            <span className="mono text-[10px] text-txt2">{formatTokens(remainingTokens)}</span>
          </div>
        )}
        <button
          onClick={onOpenRunner}
          className="rounded-md p-1.5 text-txt2 hover:bg-white/5 hover:text-green"
          title="بيئة تشغيل الكود"
        >
          <Terminal size={17} />
        </button>
      </div>
    </header>
  );
}
