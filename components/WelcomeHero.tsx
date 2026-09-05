"use client";

import { Sparkles, Terminal, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";

const QUICK_PROMPTS = [
  "اشرحلي الفرق بين let و const في JavaScript",
  "اكتبلي صفحة HTML بسيطة فيها فورم تواصل",
  "إيه أخبار الذكاء الاصطناعي في الفترة الأخيرة؟",
  "ساعدني أنظم يومي وأرتب أولوياتي",
];

export default function WelcomeHero({
  totalTokens,
  onPromptSelected,
  onOpenRunner,
}: {
  totalTokens: number;
  onPromptSelected: (prompt: string) => void;
  onOpenRunner: () => void;
}) {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center px-5 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-green/40 bg-green/10 glow-green">
        <Sparkles size={30} className="text-green" />
      </div>

      <h1 className="mt-4 text-xl font-bold text-txt">مرحباً بك في mlag AI</h1>
      <p className="mt-1 text-sm font-medium text-cyan">المساعد الذكي الفوري لكل استفساراتك</p>

      <div className="mt-3 flex items-center gap-1.5 rounded-full border border-line2 bg-panel2 px-3 py-1.5">
        <Zap size={12} className="text-cyan" />
        <span className="mono text-[11px] text-txt2">
          لديك رصيد {formatTokens(totalTokens)} توكنز • مخزّن بأمان على حسابك
        </span>
      </div>

      <div className="mt-7 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {QUICK_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => onPromptSelected(p)}
            className="rounded-md border border-line bg-panel/60 px-3 py-2.5 text-right text-[12.5px] text-txt2 transition hover:border-green/40 hover:text-txt"
          >
            {p}
          </button>
        ))}
      </div>

      <button
        onClick={onOpenRunner}
        className="mt-6 flex items-center gap-2 rounded-md border border-line2 px-3 py-1.5 text-[11.5px] text-txt3 hover:border-green/40 hover:text-green"
      >
        <Terminal size={13} /> جرّب بيئة تشغيل الكود
      </button>
    </div>
  );
}
