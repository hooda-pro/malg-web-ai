"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Square } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function BottomInputBar({
  isGenerating,
  onSend,
  onStop,
  disabled,
}: {
  isGenerating: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  disabled: boolean;
}) {
  const { t } = useSettings();
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || isGenerating) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      {/* fade so messages dissolve into the composer instead of being cut */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-gradient-to-t from-[var(--ground)] to-transparent"
      />

      <div
        className={cn(
          "mx-auto w-full max-w-[760px] rounded-xl border border-hair bg-surface shadow-2",
          "transition-[border-color,box-shadow] duration-2 ease-soft",
          "focus-within:!border-accent-line focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.05),0_28px_60px_-28px_var(--accent-line)]"
        )}
      >
        <textarea
          ref={taRef}
          id="mlag-composer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder={t("placeholder")}
          disabled={disabled}
          aria-label={t("placeholder")}
          className={cn(
            "max-h-[200px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px]",
            "leading-7 text-ink placeholder:text-ink-3 outline-none focus:outline-none focus-visible:outline-none disabled:opacity-50"
          )}
        />

        <div className="flex items-center gap-2 px-2.5 pb-2.5 pt-1">
          <p className="min-w-0 flex-1 truncate px-1.5 text-[11.5px] text-ink-3">
            {t("composerHint")}
          </p>

          {isGenerating ? (
            <button
              onClick={onStop}
              title={t("stop")}
              aria-label={t("stop")}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-full text-white",
                "bg-danger transition-transform duration-1 ease-soft active:scale-[0.92]"
              )}
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim() || disabled}
              title={t("send")}
              aria-label={t("send")}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent-ink",
                "bg-accent shadow-accent transition-all duration-1 ease-soft",
                "hover:bg-accent-hover active:scale-[0.92] disabled:bg-surface-3 disabled:text-ink-3 disabled:shadow-none"
              )}
            >
              <ArrowUp size={17} strokeWidth={2.4} className="flip-rtl" />
            </button>
          )}
        </div>
      </div>

      <p className="mx-auto mt-2 max-w-[760px] text-center text-[11px] text-ink-3">
        {t("disclaimer")}
      </p>
    </div>
  );
}
