"use client";

import { useState } from "react";
import { Check, Crown, MessageCircle } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import type { SessionUser } from "@/lib/types";
import { WHATSAPP_USERNAME, buildWhatsAppLink } from "@/lib/recharge";
import {
  FREE_PLAN,
  PRO_PLAN,
  formatUSD,
  planPrice,
  buildSubscribeMessage,
  type BillingPeriod,
  type SubscriptionInfo,
} from "@/lib/plans";
import { Button, Dialog } from "./ui/Controls";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

function fmtDate(iso: string, lang: string): string {
  try {
    return new Date(iso).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * باقات الاشتراك (زي كلود): الخطة المجانية + Pro شهرية/سنوية.
 * الاشتراك شرط مسبق لشراء التوكنز الإضافية — والدفع عبر واتساب الدعم،
 * والتفعيل يتم من لوحة الأدمن (صفحة المستخدم).
 */
export default function PlansModal({
  user,
  subscription,
  onClose,
}: {
  user: SessionUser | null;
  subscription: SubscriptionInfo | null;
  onClose: () => void;
}) {
  const { t, lang } = useSettings();
  const [period, setPeriod] = useState<BillingPeriod>("monthly");
  const isPro = !!subscription?.isPaid;

  const openWhatsApp = () => {
    const url = buildWhatsAppLink(buildSubscribeMessage(PRO_PLAN, period, user));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const proPrice = planPrice(PRO_PLAN, period);

  return (
    <Dialog
      open
      onClose={onClose}
      size="md"
      labelledBy="mlag-plans-title"
      title={t("plansTitle")}
      subtitle={t("plansSubtitle")}
    >
      <div className="mb-3 flex justify-center">
        <div className="flex rounded-full border border-hair bg-surface-2 p-1 text-[12.5px] font-medium">
          {(["monthly", "yearly"] as BillingPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "rounded-full px-4 py-1.5 transition-colors duration-1",
                period === p ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink"
              )}
            >
              {p === "monthly" ? t("planMonthly") : t("planYearly")}
              {p === "yearly" && (
                <span className="ms-1.5 rounded-full bg-live-soft px-1.5 py-px text-[10.5px] font-medium text-live">
                  {t("planSaveYearly")}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 pb-2 xs:grid-cols-2">
        <div className="flex flex-col rounded-lg border border-hair bg-surface p-4 shadow-1">
          <p className="text-[13px] font-semibold text-ink-2">{t("planFree")}</p>
          <p className="tnum mt-2 text-[24px] font-semibold leading-none tracking-display text-ink">
            $0
          </p>
          <p className="mt-1 text-[12px] text-ink-3">{t("planFreeDesc")}</p>
          <p className="mt-3 border-t border-hair pt-3 text-[12px] leading-6 text-ink-2">
            {t("planTokensPerMonth", { n: formatTokens(FREE_PLAN.monthlyTokens) })}
          </p>
          {!isPro && (
            <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent">
              <Check size={13} />
              {t("planCurrent")}
            </span>
          )}
        </div>

        <div className="relative flex flex-col rounded-lg border border-accent bg-surface p-4 shadow-[0_0_0_3.5px_var(--accent-soft)]">
          <span className="absolute -top-2.5 start-3 flex items-center gap-1 rounded-full bg-warn-soft px-2 py-px text-[11px] font-bold text-warn">
            <Crown size={11} />
            {t("planProName")} ★
          </span>
          <p className="text-[13px] font-semibold text-ink-2">{t("planProName")}</p>
          <p className="tnum mt-2 text-[24px] font-semibold leading-none tracking-display text-ink">
            {period === "monthly"
              ? t("planPerMonth", { n: formatUSD(proPrice) })
              : t("planPerYear", { n: formatUSD(proPrice) })}
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 border-t border-hair pt-3 text-[12px] leading-6 text-ink-2">
            <li className="flex items-center gap-1.5">
              <Check size={13} className="shrink-0 text-live" />
              {t("planTokensPerMonth", { n: formatTokens(PRO_PLAN.monthlyTokens) })}
            </li>
            <li className="flex items-center gap-1.5">
              <Check size={13} className="shrink-0 text-live" />
              {t("planPaidModels")}
            </li>
            <li className="flex items-center gap-1.5">
              <Check size={13} className="shrink-0 text-live" />
              {t("planTopUpAnytime")}
            </li>
          </ul>
          {isPro && subscription?.endsAt ? (
            <p className="tnum mt-3 text-[12px] font-medium text-live">
              {t("planActiveUntil", { date: fmtDate(subscription.endsAt, lang) })}
            </p>
          ) : (
            <Button variant="primary" size="sm" onClick={openWhatsApp} className="mt-3 w-full">
              <MessageCircle size={14} />
              {t("subscribeViaWhatsApp")}
            </Button>
          )}
        </div>
      </div>

      <p className="tnum pb-2 pt-1 text-center text-[12px] text-ink-3" dir="ltr">
        @{WHATSAPP_USERNAME}
      </p>
    </Dialog>
  );
}
