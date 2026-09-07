"use client";

import { AlertTriangle, X } from "lucide-react";

export default function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md animate-fadeIn">
      <div className="flex items-start gap-2 rounded-md border border-rose/50 bg-panel/95 backdrop-blur px-3 py-2.5 shadow-lg glow-cyan">
        <AlertTriangle size={16} className="text-rose mt-0.5 shrink-0" />
        <p className="text-xs text-txt leading-5 flex-1">{message}</p>
        <button onClick={onClose} className="text-txt3 hover:text-txt shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
