"use client";

import { Info, X } from "lucide-react";
import { IconButton } from "./ui/Controls";

export default function Toast({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise pointer-events-none fixed inset-x-0 top-[68px] z-toast flex justify-center px-4"
    >
      <div className="glass pointer-events-auto relative w-full max-w-md overflow-hidden rounded-lg border border-hair px-4 py-3 shadow-2">
        <div className="flex items-start gap-2.5">
          <Info size={16} className="mt-1 shrink-0 text-accent" />
          <p className="min-w-0 flex-1 text-pretty text-[13px] leading-6 text-ink">{message}</p>
          <IconButton label="Close" onClick={onClose} size="sm" className="-me-1.5 -mt-1">
            <X size={14} />
          </IconButton>
        </div>
        <span className="toast-drain absolute inset-x-0 bottom-0 h-[2px] bg-accent" />
      </div>
    </div>
  );
}

