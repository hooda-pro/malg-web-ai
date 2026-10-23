"use client";

import { useState } from "react";
import { Coins, KeyRound, Loader2, X } from "lucide-react";
import { formatBalance } from "@/lib/ai";
import type { AdminUserDetail } from "./adminTypes";

type Mode = "add" | "set" | "reset";

/** المبالغ السريعة بالدولار */
const QUICK_ADD = [2, 5, 10, 20];
const QUICK_SET = [5, 10, 20, 50];

/**
 * نافذة إدارة رصيد الـ API لمستخدم — نسخة من TokenRechargeModal.tsx لكن
 * لرصيد الـ API المنفصل تمامًا عن رصيد الشات العادي (user_api_quota).
 * المبالغ بالدولار (تحديث ١٩).
 */
export default function ApiTokenRechargeModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>("add");
  const [amount, setAmount] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const parsed = Number(String(amount).replace(",", "."));
    if (mode !== "reset" && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("أدخل مبلغ بالدولار صحيح (مثال: 5)");
      return;
    }
    if (mode === "add" && parsed <= 0) {
      setError("مبلغ الشحن لازم يكون أكبر من صفر");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/api-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, amount: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "فشلت العملية");
        return;
      }
      onDone();
    } catch {
      setError("مشكلة في الاتصال — حاول تاني");
    } finally {
      setLoading(false);
    }
  };

  const quick = mode === "set" ? QUICK_SET : QUICK_ADD;

  return (
    <div className="animate-fade fixed inset-0 z-modal flex items-end justify-center bg-black/25 px-0 backdrop-blur-md sm:items-center sm:px-4">
      <div className="glass animate-sheet-in sm:animate-materialize w-full overflow-hidden rounded-t-3xl border border-hair shadow-3 sm:max-w-[420px] sm:rounded-3xl">
        <div className="flex items-center justify-between px-6 pb-2 pt-6">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-accent" />
            <h3 className="text-[18px] font-semibold tracking-title text-ink">إدارة رصيد الـ API</h3>
          </div>
          <button onClick={onClose} aria-label="إغلاق" className="-me-2 grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink">
            <X size={15} />
          </button>
        </div>

        <div className="px-6 pb-6 pt-3">
          {/* الرصيد الحالي — منفصل تمامًا عن رصيد الشات العادي */}
          <div className="mb-4 rounded-md border border-hair bg-surface-2 px-3 py-2.5">
            <div className="tnum flex items-center justify-between text-[12px]">
              <span className="text-ink-3">رصيد API الحالي</span>
              <span className="text-ink">
                {formatBalance(user.apiUsedMicro)} / {formatBalance(user.apiTotalMicro)}
              </span>
            </div>
            <div className="tnum mt-1 flex items-center justify-between text-[12px]">
              <span className="text-ink-3">المتبقي</span>
              <span className="text-accent">
                {formatBalance(Math.max(user.apiTotalMicro - user.apiUsedMicro, 0))}
              </span>
            </div>
          </div>

          {/* نوع العملية */}
          <div className="mb-3 flex rounded-md border border-hair p-0.5">
            {(
              [
                { id: "add", label: "شحن إضافي" },
                { id: "set", label: "رصيد محدد" },
                { id: "reset", label: "تصفير" },
              ] as { id: Mode; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`flex-1 rounded py-1.5 text-[12px] transition-colors ${
                  mode === id ? "bg-accent-soft font-semibold text-accent" : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "reset" ? (
            <p className="mb-3 rounded-md border border-accent-line bg-accent-soft px-3 py-2 text-[12.5px] leading-5 text-accent">
              هيتم تصفير استهلاك رصيد الـ API لـ صفر — المستخدم يرجع رصيده كامل من غير تغيير
              التخصيص الكلي.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 rounded-md border border-hair bg-surface-2 px-2.5 py-2">
                <Coins size={14} className="shrink-0 text-ink-3" />
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  dir="ltr"
                  autoFocus
                  className="w-full bg-transparent text-[13.5px] text-ink focus:outline-none"
                  placeholder="مبلغ بالدولار (مثال: 5)"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {quick.map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(String(v))}
                    className="tnum rounded border border-hair px-2 py-1 text-[11.5px] text-ink-2 transition-colors hover:border-accent-line hover:text-accent"
                  >
                    {mode === "add" ? "+" : "="}
                    {formatBalance(Math.round(v * 1_000_000))}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="mb-2 text-[12.5px] text-danger">{error}</p>}

          <button
            onClick={submit}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-accent-soft py-2.5 text-[13.5px] font-semibold text-accent hover:bg-accent-soft disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === "add" ? "شحن الرصيد" : mode === "set" ? "تعيين الرصيد" : "تصفير الاستهلاك"}
          </button>
        </div>
      </div>
    </div>
  );
}
