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
      <div className="flex items-center justify-center gap-2 py-24 text-txt3">
        <Loader2 size={18} className="animate-spin text-green" />
        <span className="text-xs">جاري تحميل السجل…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-rose/40 bg-rose/5 p-6 text-center">
        <p className="mb-3 text-xs text-rose">{error}</p>
        <button
          onClick={load}
          className="rounded-md bg-green/15 px-4 py-2 text-[12px] font-bold text-green hover:bg-green/25"
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
          <History size={15} className="text-green" />
          <span className="text-[12.5px] text-txt2">
            كل إجراءات الأدمن المسجلة ({logs.length})
          </span>
        </div>
        <button
          onClick={load}
          title="تحديث السجل"
          className="rounded-md border border-line2 bg-panel p-2 text-txt2 transition-colors hover:text-green"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        {logs.length === 0 && (
          <p className="px-4 py-8 text-center text-[12px] text-txt3">
            مفيش إجراءات مسجلة لسه — أول ما تعمل حظر أو شحن أو حذف هيظهر هنا
          </p>
        )}
        <div className="divide-y divide-line">
          {logs.map((log) => (
            <div key={log.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span
                className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${
                  ACTION_COLORS[log.action] || "text-txt2 bg-panel3 border-line2"
                }`}
              >
                {ACTION_LABELS[log.action] || log.action}
              </span>
              <span className="min-w-0 flex-1">
                {log.details && (
                  <span className="block truncate text-[12px] text-txt">{log.details}</span>
                )}
                <span className="mono block truncate text-[10.5px] text-txt3">
                  بواسطة {log.adminEmail}
                  {log.targetEmail ? ` • الهدف: ${log.targetEmail}` : ""}
                </span>
              </span>
              <span
                className="shrink-0 text-[10.5px] text-txt3"
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