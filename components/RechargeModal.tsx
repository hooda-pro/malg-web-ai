"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import type { SessionUser } from "@/lib/types";
import {
  WHATSAPP_USERNAME,
  buildRechargeMessage,
  buildWhatsAppLink,
  RECHARGE_PACKAGES,
  type RechargePackage,
} from "@/lib/recharge";
import { Button, Dialog } from "./ui/Controls";
import { cn } from "@/lib/utils";

const STEPS = [
  "اختار الباقة المناسبة ليك",
  "واتساب هيفتح برسالة جاهزة فيها بيانات حسابك والباقة",
  "ابعت الرسالة والدعم هيأكد معاك طريقة الدفع",
  "بعد تأكيد الدفع الرصيد بيتضاف لحسابك على طول",
];

function perMillion(pkg: RechargePackage): number {
  return Math.round((pkg.price / pkg.tokens) * 1_000_000);
}

/**
 * شحن الرصيد: باقات توكنز + تحويل على واتساب الدعم برسالة جاهزة
 * فيها بيانات الحساب والباقة المختارة.
 */
export default function RechargeModal({
  user,
  quota,
  onClose,
}: {
  user: SessionUser | null;
  quota: { total: number; used: number } | null;
  onClose: () => void;
}) {
  const defaultPkg = RECHARGE_PACKAGES.find((p) => p.badge) ?? RECHARGE_PACKAGES[0];
  const [selectedId, setSelectedId] = useState<string>(defaultPkg.id);
  const [copied, setCopied] = useState(false);
  const selected = RECHARGE_PACKAGES.find((p) => p.id === selectedId) ?? defaultPkg;
  const basePerMillion = perMillion(RECHARGE_PACKAGES[0]);

  const openWhatsApp = (pkg: RechargePackage | null) => {
    const url = buildWhatsAppLink(buildRechargeMessage(pkg, user));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyUsername = async () => {
    try {
      await navigator.clipboard.writeText(WHATSAPP_USERNAME);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // تجاهل
    }
  };

  const remaining = quota ? Math.max(quota.total - quota.used, 0) : null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      labelledBy="mlag-recharge-title"
      title="شحن الرصيد"
      subtitle="زوّد رصيد التوكنز بتاعك وكمّل شغلك من غير ما تستنى التجديد."
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="tnum text-[12.5px] text-ink-3">
            {remaining !== null ? (
              <>
                رصيدك الحالي{" "}
                <span className="font-semibold text-ink">{formatTokens(remaining)}</span>
                {" → "}
                <span className="font-semibold text-accent">
                  {formatTokens(remaining + selected.tokens)}
                </span>
              </>
            ) : (
              "سجّل دخول الأول عشان الشحن يتضاف لحسابك"
            )}
          </p>
          <Button variant="primary" onClick={() => openWhatsApp(selected)} className="shrink-0">
            <MessageCircle size={15} />
            {`ادفع ${selected.price} جنيه عبر واتساب`}
          </Button>
        </div>
      }
    >
      <div role="radiogroup" aria-label="الباقات" className="grid grid-cols-1 gap-2.5 pb-4 xs:grid-cols-2">
        {RECHARGE_PACKAGES.map((pkg) => {
          const active = pkg.id === selectedId;
          const pm = perMillion(pkg);
          const saving = Math.round(((basePerMillion - pm) / basePerMillion) * 100);
          return (
            <button
              key={pkg.id}
              role="radio"
              aria-checked={active}
              onClick={() => setSelectedId(pkg.id)}
              className={cn(
                "relative flex flex-col rounded-lg border bg-surface p-4 text-start shadow-1 transition-all duration-2 ease-soft",
                active
                  ? "border-accent shadow-[0_0_0_3.5px_var(--accent-soft)]"
                  : "border-hair hover:border-hair-2"
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-medium text-ink-2">{pkg.label}</span>
                <span
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors duration-1",
                    active ? "border-accent bg-accent text-accent-ink" : "border-hair-2"
                  )}
                  aria-hidden="true"
                >
                  {active && <Check size={12} strokeWidth={3} />}
                </span>
              </span>
              <span className="mt-2 flex items-baseline gap-1.5">
                <Zap size={14} className="self-center text-accent" />
                <span className="tnum text-[24px] font-semibold leading-none tracking-display text-ink">
                  {formatTokens(pkg.tokens)}
                </span>
                <span className="text-[12px] text-ink-3">توكنز</span>
              </span>
              <span className="mt-3 flex items-center justify-between gap-2 border-t border-hair pt-3">
                <span className="tnum text-[15px] font-semibold text-ink">{pkg.price} جنيه</span>
                {pkg.badge ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                    {pkg.badge}
                  </span>
                ) : saving > 0 ? (
                  <span className="tnum text-[11.5px] font-medium text-live">وفّر {saving}%</span>
                ) : (
                  <span className="tnum text-[11.5px] text-ink-3">{pm} ج / مليون</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 rounded-lg border border-hair bg-surface-2 p-4">
        <p className="mb-3 text-[13px] font-semibold text-ink">إزاي الشحن بيتم؟</p>
        <ol className="flex flex-col gap-2.5">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-start gap-3 text-[13px] leading-6 text-ink-2">
              <span className="tnum mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-ink">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-3">
        <button
          onClick={() => openWhatsApp(null)}
          className="font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent"
        >
          محتاج كمية مخصصة؟ كلّمنا
        </button>
        <span className="inline-flex items-center gap-1.5">
          واتساب الدعم
          <span dir="ltr" className="font-mono text-ink-2">
            @{WHATSAPP_USERNAME}
          </span>
          <button
            onClick={copyUsername}
            aria-label="نسخ يوزر الدعم"
            title={copied ? "اتنسخ" : "نسخ"}
            className="grid h-7 w-7 place-items-center rounded-full transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
          >
            {copied ? <Check size={13} className="text-live" /> : <Copy size={13} />}
          </button>
        </span>
      </div>
    </Dialog>
  );
}
