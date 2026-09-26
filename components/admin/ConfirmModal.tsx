"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button, Dialog } from "../ui/Controls";
import { cn } from "@/lib/utils";

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
    <Dialog
      open
      onClose={onClose}
      labelledBy="mlag-confirm-title"
      title={title}
      subtitle={message}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={submit} disabled={!confirmed || loading}>
            {loading && <Loader2 size={14} className="animate-spin-slow" />}
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="pb-4">
        {requireText && (
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] text-ink-2">
              {"اكتب "}
              <span className="font-mono font-semibold text-danger" dir="ltr">
                {requireText}
              </span>
              {" للتأكيد:"}
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) submit();
              }}
              dir="ltr"
              className={cn(
                "h-11 w-full rounded-md border border-hair bg-surface-2 px-3.5 font-mono text-[13.5px] text-ink",
                "transition-all duration-1 focus:border-danger focus:bg-surface focus:outline-none",
                "focus:shadow-[0_0_0_3.5px_var(--danger-soft)]"
              )}
            />
          </label>
        )}
      </div>
    </Dialog>
  );
}
