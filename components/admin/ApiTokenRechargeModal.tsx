"use client";

import { useState } from "react";
import { Coins, KeyRound, Loader2, X } from "lucide-react";
import { formatTokens } from "@/lib/ai";
import type { AdminUserDetail } from "./adminTypes";

type Mode = "add" | "set" | "reset";

const QUICK_ADD = [1_000_000, 5_000_000, 10_000_000, 20_000_000];
const QUICK_SET = [1_000_000, 5_000_000, 10_000_000];

/**
 * نافذة إدارة رصيد الـ API لمستخدم — نسخة من TokenRechargeModal.tsx لكن
 * لرصيد الـ API المنفصل تمامًا عن رصيد الشات العادي (user_api_quota).
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
  const [amount, setAmount] = useState("1000000");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    const parsed = Math.floor(Number(amount));
    if (mode !== "reset" && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("أدخل رقم توكنز صحيح");
      return;
    }
    if (mode === "add" && parsed <= 0) {
      setError("كمية الشحن لازم تكون أكبر من صفر");
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-line2 bg-panel glow-green animate-slideUp">
        <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-green" />
            <h3 className="mono text-[12.5px] font-bold text-txt">إدارة رصيد الـ API</h3>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-4">
          {/* الرصيد الحالي — منفصل تمامًا عن رصيد الشات العادي */}
          <div className="mb-4 rounded-md border border-line bg-panel2 px-3 py-2.5">
            <div className="mono flex items-center justify-between text-[11px]">
              <span className="text-txt3">رصيد API الحالي</span>
              <span className="text-txt">
                {formatTokens(user.apiUsedTokens)} / {formatTokens(user.apiTotalAllocatedTokens)}
              </span>
            </div>
            <div className="mono mt-1 flex items-center justify-between text-[11px]">
              <span className="text-txt3">المتبقي</span>
              <span className="text-green">
                {formatTokens(Math.max(user.apiTotalAllocatedTokens - user.apiUsedTokens, 0))}
              </span>
            </div>
          </div>

          {/* نوع العملية */}
          <div className="mb-3 flex rounded-md border border-line2 p-0.5">
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
                className={`flex-1 rounded py-1.5 text-[11px] transition-colors ${
                  mode === id ? "bg-green/15 font-bold text-green" : "text-txt3 hover:text-txt2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "reset" ? (
            <p className="mb-3 rounded-md border border-purple/30 bg-purple/10 px-3 py-2 text-[11.5px] leading-5 text-purple">
              هيتم تصفير استهلاك رصيد الـ API لـ صفر — المستخدم يرجع رصيده كامل من غير تغيير
              التخصيص الكلي.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
                <Coins size={14} className="shrink-0 text-txt3" />
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                  inputMode="numeric"
                  dir="ltr"
                  autoFocus
                  className="w-full bg-transparent text-[12.5px] text-txt focus:outline-none"
                  placeholder="عدد التوكنز"
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                />
              </div>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {quick.map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(String(v))}
                    className="mono rounded border border-line2 px-2 py-1 text-[10.5px] text-txt2 transition-colors hover:border-green/40 hover:text-green"
                  >
                    {mode === "add" ? "+" : "="}
                    {formatTokens(v)}
                  </button>
                ))}
              </div>
            </>
          )}

          {error && <p className="mb-2 text-[11.5px] text-rose">{error}</p>}

          <button
            onClick={submit}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-green/15 py-2.5 text-[12.5px] font-bold text-green hover:bg-green/25 disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === "add" ? "شحن الرصيد" : mode === "set" ? "تعيين الرصيد" : "تصفير الاستهلاك"}
          </button>
        </div>
      </div>
    </div>
  );
}
