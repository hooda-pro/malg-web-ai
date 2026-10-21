"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  Inbox,
  Loader2,
  MessagesSquare,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
  UserMinus,
  ClipboardList,
} from "lucide-react";
import type { AdminDeletionRow } from "./adminTypes";
import ConfirmModal from "./ConfirmModal";
import { cn } from "@/lib/utils";
import { initialOf } from "./helpers";

/** مهلة الحذف باليوم — متطابقة مع lib/accountDeletion.ts */
const DELETION_DELAY_DAYS = 30;

function daysLeft(requestedAt: string): number {
  const elapsed = Date.now() - new Date(requestedAt).getTime();
  return Math.max(0, DELETION_DELAY_DAYS - Math.ceil(elapsed / (24 * 60 * 60 * 1000)));
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/**
 * قسم «حذف الحسابات» في لوحة الأدمن — طلبات الحذف المعلقة:
 * تفاصيل كل طلب (السبب + سلامة البيانات) + رفض (إلغاء) أو حذف نهائي فوري.
 */
export default function DeletionsList({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminDeletionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminDeletionRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/deletions");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحميل طلبات الحذف");
      setRows(data.deletions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل طلبات الحذف");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter(
    (r) =>
      !q.trim() ||
      r.email.toLowerCase().includes(q.trim().toLowerCase()) ||
      r.displayName.toLowerCase().includes(q.trim().toLowerCase())
  );

  const act = async (action: "reject" | "delete") => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/deletions/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "العملية فشلت");
      }
      setSelected(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "العملية فشلت");
    } finally {
      setBusy(false);
      setConfirmDelete(false);
      setConfirmReject(false);
    }
  };

  // ——— شاشة تفاصيل الطلب ———
  if (selected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelected(null)}
            title="رجوع للقايمة"
            className="flex shrink-0 items-center gap-2 rounded-md border border-hair bg-surface px-3 py-2 text-[13px] text-ink-2 transition-colors hover:text-accent"
          >
            <ChevronLeft size={15} className="flip-rtl" />
            رجوع
          </button>
          <p className="text-[15px] font-semibold text-ink">تفاصيل طلب الحذف</p>
        </div>

        <div className="rounded-lg border border-hair bg-surface shadow-1">
          <div className="flex items-center gap-3 border-b border-hair px-4 py-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-[15px] font-semibold text-danger">
              {initialOf(selected.displayName)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-ink">{selected.displayName}</span>
              <span className="block truncate text-[12.5px] text-ink-3" dir="ltr">{selected.email}</span>
            </span>
            <span
              className={cn(
                "ms-auto rounded px-2 py-0.5 text-[11.5px] font-semibold tnum",
                daysLeft(selected.requestedAt) <= 3
                  ? "bg-danger-soft text-danger"
                  : "bg-warn-soft text-warn"
              )}
            >
              متبقي {daysLeft(selected.requestedAt)} يوم
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-[13px] sm:grid-cols-3">
            <div>
              <p className="text-[11.5px] text-ink-3">تاريخ التسجيل في الموقع</p>
              <p className="tnum mt-0.5 text-[13px] font-medium text-ink">{formatDateTime(selected.createdAt)}</p>
            </div>
            <div>
              <p className="text-[11.5px] text-ink-3">تاريخ طلب الحذف</p>
              <p className="tnum mt-0.5 text-[13px] font-medium text-ink">{formatDateTime(selected.requestedAt)}</p>
            </div>
            <div>
              <p className="text-[11.5px] text-ink-3">المحادثات / الرسايل</p>
              <p className="tnum mt-0.5 text-[13px] font-medium text-ink">
                {selected.sessionsCount} / {selected.messagesCount}
              </p>
            </div>
          </div>

          {/* سبب الحذف — اللي المستخدم كتبه */}
          <div className="border-b border-hair px-4 py-4">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
              <ClipboardList size={14} className="text-ink-3" />
              سبب الحذف (كتبه المستخدم)
            </p>
            <div className="rounded-md border border-hair bg-surface-2 px-3.5 py-3">
              <p className="whitespace-pre-wrap text-[13.5px] leading-7 text-ink" dir="rtl">
                {selected.reason || "—"}
              </p>
            </div>
          </div>

          {/* القرار */}
          <div className="grid gap-2.5 px-4 py-4 sm:grid-cols-3">
            <button
              onClick={() => setConfirmReject(true)}
              disabled={busy}
              className="flex h-10 items-center justify-center gap-2 rounded-full border border-accent-line bg-accent-soft px-4 text-[13.5px] font-semibold text-accent transition-colors hover:brightness-105 disabled:opacity-50"
            >
              <Undo2 size={15} />
              إلغاء الحذف
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={busy}
              className="flex h-10 items-center justify-center gap-2 rounded-full bg-danger px-4 text-[13.5px] font-semibold text-white transition-all hover:brightness-110 disabled:opacity-50"
            >
              <Trash2 size={15} />
              اعتمد الحذف
            </button>
            <button
              onClick={() => onOpenUser(selected.id)}
              className="flex h-10 items-center justify-center gap-2 rounded-full border border-hair px-4 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-hair-2 hover:text-ink"
            >
              <UserMinus size={15} />
              التفاصيل الكاملة
            </button>
          </div>
        </div>

        {confirmDelete && (
          <ConfirmModal
            title="حذف نهائي فوري"
            message={`هيتم حذف حساب ${selected.displayName} مع كل المحادثات والرسايل والرصيد فورًا — من غير استرجاع بعد كده. اكتب الإيميل بتاعه عشان تأكد.`}
            danger
            confirmLabel="احذف الحساب"
            requireText={selected.email}
            onConfirm={() => act("delete")}
            onClose={() => setConfirmDelete(false)}
          />
        )}
        {confirmReject && (
          <ConfirmModal
            title="رفض طلب الحذف"
            message={`هيتم إلغاء طلب حذف ${selected.displayName} والحساب يرجع شغّال طبيعي زي ما كان — مفيش أي بيانات هتتحذف.`}
            confirmLabel="ألغِ الطلب"
            onConfirm={() => act("reject")}
            onClose={() => setConfirmReject(false)}
          />
        )}
      </div>
    );
  }

  // ——— القايمة ———
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-hair bg-surface px-3 py-2">
          <Search size={15} className="shrink-0 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="دور بالاسم أو البريد الإلكتروني…"
            className="w-full bg-transparent text-[13.5px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </div>
        <button
          onClick={() => load()}
          title="تحديث القايمة"
          className="shrink-0 rounded-md border border-hair bg-surface p-2 text-ink-2 transition-colors hover:text-accent"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <p className="tnum flex items-center gap-2 text-[12px] text-ink-3">
        {loading ? (
          <>
            <Loader2 size={13} className="animate-spin-slow" /> جاري التحميل…
          </>
        ) : (
          `${filtered.length} طلب حذف معلق`
        )}
        <span className="ms-auto inline-flex items-center gap-1.5">
          <CalendarClock size={13} />
          الحذف التلقائي بعد {DELETION_DELAY_DAYS} يوم من عدم الدخول
        </span>
      </p>

      {error && (
        <div className="rounded-lg border border-hair bg-danger-soft p-4 text-center text-[13px] text-danger">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-hair bg-surface shadow-1">
        {filtered.length === 0 && !loading && !error && (
          <div className="px-4 py-12 text-center">
            <Inbox size={28} className="mx-auto text-ink-3" />
            <p className="mt-3 text-[13.5px] font-medium text-ink-2">
              {q ? `مفيش نتائج للبحث عن "${q}"` : "مفيش طلبات حذف حاليًا — كل الحسابات شغّالة"}
            </p>
            <p className="mt-1 text-[12px] text-ink-3">
              لما مستخدم يطلب حذف حسابه من إعدادات الموقع، الطلب هيظهر هنا.
            </p>
          </div>
        )}
        <div className="divide-y divide-hair">
          {filtered.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="flex w-full items-center gap-3 px-3 py-3 text-right transition-colors hover:bg-surface-2 md:px-4"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-soft text-[13px] font-semibold text-danger">
                {initialOf(r.displayName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-ink">{r.displayName}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {r.reason ? `“${r.reason}”` : "من غير سبب مكتوب"}
                </span>
              </span>
              <span className="hidden shrink-0 items-center gap-2 md:flex">
                <span className="tnum inline-flex items-center gap-1 text-[11.5px] text-ink-3">
                  <MessagesSquare size={12} /> {r.messagesCount}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-semibold tnum",
                    daysLeft(r.requestedAt) <= 3 ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"
                  )}
                >
                  متبقي {daysLeft(r.requestedAt)} يوم
                </span>
              </span>
              <ChevronLeft size={16} className="shrink-0 text-ink-3 flip-rtl" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
