"use client";

import { useEffect, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import type { AdminLogRow, } from "./adminTypes";
import { ACTION_COLORS, ACTION_LABELS } from "./adminTypes";
import { formatDateTime, timeAgo } from "./helpers";

export default function AdminLogs() {
  const [logs, setLogs] = useState<AdminLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/logs");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحميل السجل");
      setLogs(data.logs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل السجل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-3">
        <Loader2 size={18} className="animate-spin text-accent" />
        <span className="text-[13px]">جاري تحميل السجل…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-hair bg-danger-soft p-6 text-center">
        <p className="mb-3 text-[13px] text-danger">{error}</p>
        <button
          onClick={load}
          className="rounded-md bg-accent-soft px-4 py-2 text-[13px] font-semibold text-accent hover:bg-accent-soft"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History size={15} className="text-accent" />
          <span className="text-[13.5px] text-ink-2">
            كل إجراءات الأدمن المسجلة ({logs.length})
          </span>
        </div>
        <button
          onClick={load}
          title="تحديث السجل"
          className="rounded-md border border-hair bg-surface p-2 text-ink-2 transition-colors hover:text-accent"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-hair bg-surface shadow-1">
        {logs.length === 0 && (
          <p className="px-4 py-8 text-center text-[13px] text-ink-3">
            مفيش إجراءات مسجلة لسه — أول ما تعمل حظر أو شحن أو حذف هيظهر هنا
          </p>
        )}
        <div className="divide-y divide-hair">
          {logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span
                className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold ${
                  ACTION_COLORS[log.action] || "text-ink-2 bg-surface-3 border-hair"
                }`}
              >
                {ACTION_LABELS[log.action] || log.action}
              </span>
              <span className="min-w-0 flex-1">
                {log.details && (
                  <span className="block truncate text-[13px] text-ink">{log.details}</span>
                )}
                <span className="tnum block truncate text-[11.5px] text-ink-3">
                  بواسطة {log.adminEmail}
                  {log.targetEmail ? ` • الهدف: ${log.targetEmail}` : ""}
                </span>
              </span>
              <span
                className="shrink-0 text-[11.5px] text-ink-3"
                title={formatDateTime(log.createdAt)}
              >
                {timeAgo(log.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}