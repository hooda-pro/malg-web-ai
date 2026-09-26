"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Ban,
  CalendarClock,
  Hash,
  Loader2,
  MessageCircle,
  RefreshCw,
  TrendingUp,
  UserPlus,
  Users as UsersIcon,
} from "lucide-react";
import { formatTokens } from "@/lib/ai";
import type { AdminStats } from "./adminTypes";
import { formatDate, initialOf, usagePercent } from "./helpers";

/** بطاقة إحصائية */
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-hair bg-surface p-4 shadow-1 transition-colors duration-1 hover:border-hair-2">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={15} className="text-accent" />
        <span className="text-[11.5px] text-ink-2">{label}</span>
      </div>
      <p className="tnum text-xl font-semibold text-ink">{value}</p>
      {sub && <p className="mt-1 text-[10.5px] text-ink-3">{sub}</p>}
    </div>
  );
}

export default function StatsOverview({ onSelectUser }: { onSelectUser: (id: string) => void }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحميل الإحصائيات");
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل الإحصائيات");
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
        <span className="text-[12.5px]">جاري تحميل الإحصائيات…</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-lg border border-danger/25 bg-danger-soft p-6 text-center">
        <p className="mb-3 text-[12.5px] text-danger">{error || "حصل خطأ غير متوقع"}</p>
        <button
          onClick={load}
          className="rounded-lg bg-accent px-4 py-2 text-[12.5px] font-medium text-accent-ink shadow-accent transition-colors duration-1 hover:bg-accent-hover"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  const usedPct = usagePercent(stats.totalUsed, stats.totalAllocated);

  return (
    <div className="space-y-6">
      {/* بطاقات الأرقام */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          icon={UsersIcon}
          label="إجمالي المستخدمين"
          value={formatTokens(stats.totalUsers)}
          sub={`${formatTokens(stats.newToday)} جديد اليوم • ${formatTokens(stats.newWeek)} الأسبوع ده`}
        />
        <StatCard icon={Ban} label="حسابات محظورة" value={formatTokens(stats.bannedUsers)} />
        <StatCard icon={MessageCircle} label="المحادثات" value={formatTokens(stats.totalSessions)} />
        <StatCard icon={Hash} label="الرسائل" value={formatTokens(stats.totalMessages)} />
        <StatCard
          icon={Activity}
          label="التوكنز المستهلكة"
          value={formatTokens(stats.totalUsed)}
          sub={`من ${formatTokens(stats.totalAllocated)} مخصصة (${usedPct}%)`}
        />
      </div>

      {/* استهلاك التوكنز الإجمالي */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-accent" />
            <span className="text-[12.5px] font-medium text-ink">نسبة استهلاك التوكنز الكلية</span>
          </div>
          <span className="tnum text-[11.5px] text-ink-2">
            {formatTokens(stats.totalUsed)} / {formatTokens(stats.totalAllocated)}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-accent transition-all duration-3 ease-soft"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* أكبر المستهلكين */}
        <div className="rounded-lg border border-hair bg-surface shadow-1">
          <div className="flex items-center justify-between border-b border-hair px-4 py-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-accent" />
              <h2 className="text-[12.5px] font-medium text-ink">أكبر 5 مستهلكين للتوكنز</h2>
            </div>
            <button onClick={load} title="تحديث" className="text-ink-3 transition-colors duration-1 hover:text-ink">
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="divide-y divide-hair">
            {stats.topUsers.length === 0 && (
              <p className="px-4 py-4 text-[11.5px] text-ink-3">مفيش بيانات لسه</p>
            )}
            {stats.topUsers.map((u, i) => {
              const pct = usagePercent(u.usedTokens, u.totalAllocatedTokens);
              return (
                <button
                  key={u.id}
                  onClick={() => onSelectUser(u.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition-colors duration-1 hover:bg-surface-3"
                >
                  <span className="tnum w-5 shrink-0 text-[11px] text-ink-3">#{i + 1}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-medium text-accent">
                    {initialOf(u.displayName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-ink">{u.displayName}</span>
                    <span className="tnum block truncate text-[10.5px] text-ink-3" dir="ltr">
                      {u.email}
                    </span>
                  </span>
                  <span className="shrink-0 text-left">
                    <span className="tnum block text-[11.5px] text-warn">
                      {formatTokens(u.usedTokens)}
                    </span>
                    <span className="tnum block text-[10px] text-ink-3">{pct}%</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* أحدث المسجلين */}
        <div className="rounded-lg border border-hair bg-surface shadow-1">
          <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
            <UserPlus size={14} className="text-accent" />
            <h2 className="text-[12.5px] font-medium text-ink">أحدث المستخدمين</h2>
          </div>
          <div className="divide-y divide-hair">
            {stats.recentUsers.length === 0 && (
              <p className="px-4 py-4 text-[11.5px] text-ink-3">مفيش مستخدمين لسه</p>
            )}
            {stats.recentUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => onSelectUser(u.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition-colors duration-1 hover:bg-surface-3"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-medium text-accent">
                  {initialOf(u.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-ink">{u.displayName}</span>
                  <span className="tnum block truncate text-[10.5px] text-ink-3" dir="ltr">
                    {u.email}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-ink-3">
                  <CalendarClock size={11} />
                  {formatDate(u.createdAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
