"use client";

import { useEffect, useState } from "react";
import { Check, Coins, Copy, ExternalLink, MessageCircle, X, Zap } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import type { SessionUser } from "@/lib/types";
import {
  WHATSAPP_USERNAME,
  buildRechargeMessage,
  buildWhatsAppLink,
  RECHARGE_PACKAGES,
  type RechargePackage,
} from "@/lib/recharge";

/**
 * مودال شحن الرصيد للمستخدم — باقات التوكنز + زر تحويل على واتساب الدعم
 * بصيغة wa.me/<username> مع رسالة جاهزة فيها بيانات الحساب والباقة.
 */
export default function RechargeModal({
  user,
  onClose,
}: {
  user: SessionUser | null;
  onClose: () => void;
}) {
  const [quota, setQuota] = useState<{ total: number; used: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch("/api/quota");
        const data = await res.json();
        if (data?.quota) {
          setQuota({ total: data.quota.totalAllocatedTokens, used: data.quota.usedTokens });
        }
      } catch {
        // تجاهل — الرصيد مش أساسي لعملية الشحن
      }
    })();
  }, [user]);

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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line2 bg-panel glow-green animate-slideUp">
        {/* الهيدر */}
        <div className="terminal-dots sticky top-0 z-10 flex items-center justify-between border-b border-line bg-panel px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-rose/70" />
              <span className="h-2 w-2 rounded-full bg-amber/70" />
              <span className="h-2 w-2 rounded-full bg-green/70" />
            </span>
            <span className="mono text-[11px] text-txt3">recharge.sh — شحن الرصيد</span>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4">
          {/* الرصيد الحالي */}
          {user ? (
            <div className="mb-4 rounded-md border border-line bg-panel2 px-3 py-2.5">
              <div className="mono flex items-center justify-between text-[11px]">
                <span className="text-txt3">رصيدك الحالي</span>
                <span className="text-txt">
                  {quota
                    ? `${formatTokens(quota.used)} / ${formatTokens(quota.total)}`
                    : "جاري التحميل…"}
                </span>
              </div>
              {quota && (
                <div className="mono mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-txt3">المتبقي</span>
                  <span className="text-green">
                    {formatTokens(Math.max(quota.total - quota.used, 0))}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="mb-4 rounded-md border border-cyan/30 bg-cyan/10 px-3 py-2 text-[11.5px] leading-5 text-cyan">
              سجل دخول بحساب الأول، واشتري أي باقة — وهنشحنها لحسابك على طول.
            </p>
          )}

          {/* الباقات */}
          <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {RECHARGE_PACKAGES.map((pkg) => (
              <div
                key={pkg.id}
                className={`relative flex flex-col rounded-lg border p-3 transition-colors ${
                  pkg.badge ? "border-amber/40 bg-amber/[0.04]" : "border-line bg-panel2 hover:border-line2"
                }`}
              >
                {pkg.badge && (
                  <span className="absolute -top-2 start-3 rounded-full bg-amber px-2 py-0.5 text-[9px] font-bold text-black">
                    {pkg.badge}
                  </span>
                )}
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-lg">{pkg.emoji}</span>
                  <span className="text-[13px] font-bold text-txt">{pkg.label}</span>
                </div>
                <p className="mb-2 text-[10.5px] leading-4 text-txt3">{pkg.hint}</p>
                <div className="mono mb-3 mt-auto flex items-baseline justify-between">
                  <span className="flex items-center gap-1 text-[12px] font-bold text-cyan">
                    <Zap size={11} />
                    {formatTokens(pkg.tokens)}
                  </span>
                  <span className="text-[14px] font-bold text-amber">{pkg.price} جنيه</span>
                </div>
                <button
                  onClick={() => openWhatsApp(pkg)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-green/15 py-2 text-[11.5px] font-bold text-green transition-colors hover:bg-green/25"
                >
                  <MessageCircle size={13} />
                  اشحن عبر واتساب
                </button>
              </div>
            ))}
          </div>

          {/* كمية مخصصة */}
          <button
            onClick={() => openWhatsApp(null)}
            className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-md border border-line2 py-2.5 text-[12px] text-txt2 transition-colors hover:border-cyan/40 hover:text-cyan"
          >
            <ExternalLink size={13} />
            عايز كمية مخصصة؟ كلمنا واتساب
          </button>

          {/* خطوات الشحن */}
          <div className="mb-4 rounded-md border border-line bg-panel2 px-3 py-3">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-txt">
              <Coins size={13} className="text-amber" />
              إزاي بتحصل على توكنزك؟
            </p>
            <ol className="space-y-1.5 text-[11px] leading-5 text-txt2">
              <li>١. اختار الباقة المناسبة ودوس «اشحن عبر واتساب».</li>
              <li>٢. هيفتحلك واتساب برسالة جاهزة فيها بيانات حسابك والباقة.</li>
              <li>٣. ابعث الرسالة وهيتواصل معاك الدعم لتأكيد الدفع.</li>
              <li>٤. أول ما يتأكد الدفع، رصيدك بيتضاف لحسابك فورًا 🎉</li>
            </ol>
          </div>

          {/* يوزر الدعم — احتياط لو الرابط مشفتح عند حد */}
          <div className="flex items-center justify-between rounded-md border border-line bg-panel2 px-3 py-2">
            <span className="text-[11px] text-txt3">
              يوزر واتساب الدعم:{" "}
              <span className="mono font-bold text-green" dir="ltr">
                @{WHATSAPP_USERNAME}
              </span>
            </span>
            <button
              onClick={copyUsername}
              title="نسخ اليوزر"
              className="flex items-center gap-1 text-[11px] text-txt3 transition-colors hover:text-green"
            >
              {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
              {copied ? "اتنسخ" : "نسخ"}
            </button>
          </div>

          <p className="mt-2 text-center text-[10px] leading-4 text-txt3">
            الشحن بيتضاف لحسابك يدويًا بعد تأكيد الدفع — لو الرابط مافتحش عندك، دوس «نسخ» ودور على
            اليوزر في واتساب وابعتله.
          </p>
        </div>
      </div>
    </div>
  );
}