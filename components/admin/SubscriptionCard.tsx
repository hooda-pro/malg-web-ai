"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, Loader2 } from "lucide-react";
import { PRO_PLAN, formatUSD, planPrice } from "@/lib/plans";

interface SubRow {
  id: string;
  planId: string;
  planName: string;
  period: "monthly" | "yearly" | null;
  startedAt: string;
  endsAt: string | null;
  isPaid: boolean;
  status: string;
}

function fmtDT(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

/** بطاقة اشتراك المستخدم (Pro شهرية/سنوية) — تفعيل/إلغاء يدوي بعد تأكيد الدفع */
export default function SubscriptionCard({ userId, userName }: { userId: string; userName: string }) {
  const [current, setCurrent] = useState<SubRow | null>(null);
  const [history, setHistory] = useState<SubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/subscription`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحميل");
      setCurrent(data.current ?? null);
      setHistory(Array.isArray(data.history) ? data.history.slice(0, 5) : []);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "فشل التحميل" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activate = async () => {
    setActing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate", planId: "pro", period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التفعيل");
      setCurrent(data.current ?? null);
      setMsg({ ok: true, text: `تم تفعيل Pro (${period === "yearly" ? "سنوي" : "شهري"}) لـ ${userName} + رصيد الباقة` });
      void load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "فشل التفعيل" });
    } finally {
      setActing(false);
    }
  };

  const cancel = async () => {
    if (!confirm(`إلغاء اشتراك ${userName}؟ (رصيده الممنوح يبقى، لكن الموديلات المدفوعة والشحن يتقفلوا)`)) return;
    setActing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإلغاء");
      setCurrent(null);
      setMsg({ ok: true, text: "تم إلغاء الاشتراك" });
      void load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "فشل الإلغاء" });
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown size={15} className="text-warn" />
          <h3 className="text-[13px] font-semibold text-ink">اشتراك الباقة</h3>
        </div>
        {loading ? (
          <Loader2 size={14} className="animate-spin text-ink-3" />
        ) : current ? (
          <span className="flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[12px] font-bold text-warn">
            {current.planName} ★
          </span>
        ) : (
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[12px] font-medium text-ink-3">
            الخطة المجانية
          </span>
        )}
      </div>

      {current && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2">
            <p className="text-[13px] font-semibold text-ink">{current.period === "yearly" ? "سنوي" : "شهري"}</p>
            <p className="text-[11px] text-ink-3">المدة</p>
          </div>
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2">
            <p className="tnum text-[13px] font-semibold text-ink">{fmtDT(current.startedAt)}</p>
            <p className="text-[11px] text-ink-3">بدأ</p>
          </div>
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2">
            <p className="tnum text-[13px] font-semibold text-live">{fmtDT(current.endsAt)}</p>
            <p className="text-[11px] text-ink-3">ينتهي</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value === "yearly" ? "yearly" : "monthly")}
          className="h-9 rounded-md border border-hair bg-surface-2 px-2.5 text-[13px] text-ink"
        >
          <option value="monthly">شهري — {formatUSD(planPrice(PRO_PLAN, "monthly"))}</option>
          <option value="yearly">سنوي — {formatUSD(planPrice(PRO_PLAN, "yearly"))}</option>
        </select>
        <button
          onClick={activate}
          disabled={acting}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
        >
          {acting ? <Loader2 size={14} className="animate-spin" /> : <Crown size={14} />}
          تفعيل Pro + منح الرصيد
        </button>
        {current && (
          <button
            onClick={cancel}
            disabled={acting}
            className="rounded-md border border-hair px-3.5 py-2 text-[13px] font-medium text-danger hover:bg-danger-soft disabled:opacity-40"
          >
            إلغاء الاشتراك
          </button>
        )}
      </div>

      {history.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-hair pt-2">
          {history.map((h) => (
            <p key={h.id} className="tnum flex items-center justify-between text-[11.5px] text-ink-3">
              <span>
                {h.planName} · {h.period === "yearly" ? "سنوي" : "شهري"} · {h.status}
              </span>
              <span>{fmtDT(h.endsAt)}</span>
            </p>
          ))}
        </div>
      )}

      {msg && (
        <p className={`mt-2 rounded-md px-3 py-1.5 text-[12px] ${msg.ok ? "bg-live-soft text-live" : "bg-danger-soft text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
