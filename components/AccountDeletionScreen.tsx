"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, ShieldAlert, Trash2, X } from "lucide-react";
import { useSettings } from "./SettingsContext";
import { Button } from "./ui/Controls";
import { cn } from "@/lib/utils";

/**
 * شاشة حذف الحساب الكاملة (فول سكرين) — مش دايلوج صغير:
 * - خطوة 1: شرح + كتابة السبب (إجباري) + تأكيد الفهم، وزرّين: «تأكيد الحذف» و«إلغاء».
 * - عند التأكيد: الطلب بيتسجل في السيرفر + تسجيل خروج تلقائي (من غير شاشة دخول)،
 *   وبعدين تظهر شاشة ختامية «سيتم حذف حسابك بعد 30 يوم» بتاريخ الانتهاء.
 * - خطوة 2 (الختامية): مفيش زر خروج — بس زر إغلاق صغير (X) فوق.
 */
export default function AccountDeletionScreen({
  open,
  email,
  onClose,
  onAutoLogout,
}: {
  open: boolean;
  /** إيميل الحساب اللي هيتحذف — للعناوين في خطوة التأكيد */
  email: string | null;
  /** إغلاق الشاشة (إلغاء أو X) */
  onClose: () => void;
  /** اتنده عليه بعد نجاح تسجيل الحذف — بيعمل تسجيل خروج تلقائي من غير فتح تسجيل الدخول */
  onAutoLogout: () => void;
}) {
  const { t } = useSettings();
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scheduledAfter, setScheduledAfter] = useState<string | null>(null);

  const reasonValid = reason.trim().length >= 10;

  // قفل سكرول الصفحة لما الشاشة مفتوحة
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape يغلق (إلغاء)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async () => {
    if (!reasonValid || !ack || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/account/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(data.error || t("errGeneric"));
        return;
      }
      setScheduledAfter(data.deleteAfter as string);
      // تسجيل خروج تلقائي فورًا (الشاشة دي مش هتتقفل — الجلسة خلصت والحساب اتجمد)
      onAutoLogout();
    } catch {
      setErr(t("errConn"));
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("ar-EG", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return iso;
    }
  };

  const content =
    // ——— خطوة 2: شاشة «سيتم حذف حسابك بعد 30 يوم» ———
    scheduledAfter ? (
      <div
        className="relative my-auto flex w-full max-w-md flex-col items-center rounded-2xl border border-hair bg-surface px-6 pb-8 pt-8 text-center shadow-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={t("close")}
          title={t("close")}
          className="absolute end-3.5 top-3.5 rounded-full p-1.5 text-ink-3 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
        >
          <X size={17} />
        </button>

        <span className="grid h-16 w-16 place-items-center rounded-full bg-danger-soft">
          <Trash2 size={30} className="text-danger" />
        </span>
        <h2 className="mt-4 text-[19px] font-bold tracking-title text-ink">
          {t("deletionScheduledTitle")}
        </h2>
        <p className="mt-3 max-w-sm text-[13.5px] leading-7 text-ink-2">
          {t("deletionScheduledLine1")}{" "}
          <span className="tnum font-semibold text-danger">{fmtDate(scheduledAfter)}</span>.
        </p>
        <p className="mt-4 w-full rounded-lg border border-hair bg-surface-2 px-4 py-3 text-[12.5px] font-medium leading-6 text-ink">
          {t("deletionScheduledCancelNote")}
        </p>
        <p className="mt-2.5 text-[11.5px] leading-6 text-ink-3">
          {t("deletionScheduledSupportNote")}
        </p>
      </div>
    ) : (
      // ——— خطوة 1: التأكيد — سبب + زرّي «تأكيد الحذف» و«إلغاء» ———
      <div
        className="relative my-auto flex w-full max-w-md flex-col gap-4 rounded-2xl border border-hair bg-surface px-6 pb-6 pt-6 shadow-2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-danger-soft">
            <Trash2 size={22} className="text-danger" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold tracking-title text-ink">
              {t("deleteAccountTitle")}
            </h2>
            {email && (
              <p className="tnum truncate text-[12px] text-ink-3" dir="ltr">
                {email}
              </p>
            )}
          </div>
        </div>

        <p className="text-[13px] leading-7 text-ink-2">{t("deletionIntro")}</p>

        <label htmlFor="mlag-deletion-reason" className="block text-[13.5px] font-medium text-ink">
          {t("deletionReasonLabel")}
        </label>
        <textarea
          id="mlag-deletion-reason"
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setErr(null);
          }}
          rows={3}
          maxLength={500}
          placeholder={t("deletionReasonPh")}
          className={cn(
            "min-h-24 w-full resize-none rounded-md border border-hair bg-surface-2 px-3 py-2.5",
            "text-[14px] text-ink placeholder:text-ink-3 transition-all duration-1",
            "hover:border-hair-2 focus:bg-surface focus:outline-none"
          )}
        />

        <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-6 text-ink-2">
          <input
            type="checkbox"
            checked={ack}
            onChange={(e) => setAck(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          {t("deletionAck")}
        </label>

        {err && (
          <p role="alert" className="text-[12.5px] text-danger">
            {err}
          </p>
        )}

        {/* زرّي التأكيد والإلغاء */}
        <div className="mt-1 flex flex-col gap-2.5 sm:flex-row-reverse">
          <Button
            variant="danger"
            onClick={submit}
            disabled={!reasonValid || !ack || busy}
            className="w-full sm:flex-1"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            {t("deletionConfirmBtn")}
          </Button>
          <Button onClick={onClose} className="w-full sm:flex-1">
            {t("cancel")}
          </Button>
        </div>

        <p className="flex items-start gap-1.5 text-[11.5px] leading-6 text-ink-3">
          <ShieldAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          {t("deletionAutoLogoutNote")}
        </p>
      </div>
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      {content}
    </div>,
    document.body
  );
}
