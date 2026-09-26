"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

/**
 * نافذة تأكيد عامة — بتستخدم في الحذف والحظر وغيرها.
 * لو `requireText` متحدد، المستخدم لازم يكتب نفس النص عشان يتفعل زر التأكيد
 * (بنستخدمها في حذف الحساب — يكتب إيميل المستخدم بنفسه).
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  danger = false,
  requireText,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireText?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [loading, setLoading] = useState(false);

  const confirmed = !requireText || typed.trim() === requireText;

  const submit = async () => {
    if (!confirmed || loading) return;
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div
        className={`w-full max-w-sm overflow-hidden rounded-lg border bg-panel animate-slideUp ${
          danger ? "border-rose/50" : "border-line2 glow-green"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            {danger && <AlertTriangle size={15} className="text-rose" />}
            <h3 className="mono text-[12.5px] font-bold text-txt">{title}</h3>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-4">
          <p className="mb-4 text-[12.5px] leading-6 text-txt2">{message}</p>

          {requireText && (
            <div className="mb-4">
              <p className="mb-1.5 text-[11px] text-txt3">
                اكتب <span className="mono font-bold text-rose" dir="ltr">{requireText}</span> للتأكيد:
              </p>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                dir="ltr"
                autoFocus
                className="w-full rounded-md border border-line2 bg-panel2 px-2.5 py-2 text-[12.5px] text-txt focus:border-rose/50 focus:outline-none"
              />
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={!confirmed || loading}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md py-2.5 text-[12.5px] font-bold transition-colors disabled:opacity-40 ${
                danger
                  ? "bg-rose/15 text-rose hover:bg-rose/25"
                  : "bg-green/15 text-green hover:bg-green/25"
              }`}
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {confirmLabel}
            </button>
            <button
              onClick={onClose}
              disabled={loading}
              className="rounded-md border border-line2 px-4 py-2.5 text-[12.5px] text-txt2 hover:text-txt disabled:opacity-40"
            >
              {cancelLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}