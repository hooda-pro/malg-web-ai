"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Square } from "lucide-react";

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
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 88) + "px";
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
    <div className="border-t border-line bg-panel/95 backdrop-blur px-3 py-1.5">
      <div className="flex items-end gap-2 rounded-lg border border-line2 bg-panel2 px-2.5 py-1.5 focus-within:border-green/50">
        <span className="mono select-none pb-1.5 text-sm text-green">{">"}</span>
        <textarea
          ref={taRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="اكتب رسالتك هنا..."
          disabled={disabled}
          className="max-h-[88px] flex-1 resize-none bg-transparent text-[13px] text-txt placeholder:text-txt3 focus:outline-none disabled:opacity-50"
        />
        {isGenerating ? (
          <button
            onClick={onStop}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose/20 text-rose hover:bg-rose/30"
            title="إيقاف"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-green/15 text-green hover:bg-green/25 disabled:opacity-30"
            title="إرسال"
          >
            <Send size={13} className="flip-rtl" />
          </button>
        )}
      </div>
      <p className="mt-1 text-center text-[10px] text-txt3">
        mlag AI ممكن يغلط أحياناً — راجع المعلومات المهمة.
      </p>
    </div>
  );
}
