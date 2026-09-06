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
  accent,
}: {
  icon: typeof UsersIcon;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4 transition-colors hover:border-line2">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={15} className={accent} />
        <span className="text-[11.5px] text-txt2">{label}</span>
      </div>
      <p className="mono text-xl font-bold text-txt">{value}</p>
      {sub && <p className="mt-1 text-[10.5px] text-txt3">{sub}</p>}
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
      <div className="flex items-center justify-center gap-2 py-24 text-txt3">
        <Loader2 size={18} className="animate-spin text-green" />
        <span className="text-xs">جاري تحميل الإحصائيات…</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-lg border border-rose/40 bg-rose/5 p-6 text-center">
        <p className="mb-3 text-xs text-rose">{error || "حصل خطأ غير متوقع"}</p>
        <button
          onClick={load}
          className="rounded-md bg-green/15 px-4 py-2 text-[12px] font-bold text-green hover:bg-green/25"
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
          accent="text-green"
        />
        <StatCard icon={Ban} label="حسابات محظورة" value={formatTokens(stats.bannedUsers)} accent="text-rose" />
        <StatCard icon={MessageCircle} label="المحادثات" value={formatTokens(stats.totalSessions)} accent="text-cyan" />
        <StatCard icon={Hash} label="الرسائل" value={formatTokens(stats.totalMessages)} accent="text-purple" />
        <StatCard
          icon={Activity}
          label="التوكنز المستهلكة"
          value={formatTokens(stats.totalUsed)}
          sub={`من ${formatTokens(stats.totalAllocated)} مخصصة (${usedPct}%)`}
          accent="text-amber"
        />
      </div>

      {/* استهلاك التوكنز الإجمالي */}
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={15} className="text-amber" />
            <span className="text-[12.5px] font-bold text-txt">نسبة استهلاك التوكنز الكلية</span>
          </div>
          <span className="mono text-[11.5px] text-txt2">
            {formatTokens(stats.totalUsed)} / {formatTokens(stats.totalAllocated)}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-panel3">
          <div
            className="h-full rounded-full bg-gradient-to-l from-green to-cyan transition-all"
            style={{ width: `${usedPct}%` }}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* أكبر المستهلكين */}
        <div className="rounded-lg border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-amber" />
              <h2 className="text-[12.5px] font-bold text-txt">أكبر 5 مستهلكين للتوكنز</h2>
            </div>
            <button onClick={load} title="تحديث" className="text-txt3 hover:text-txt">
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="divide-y divide-line">
            {stats.topUsers.length === 0 && (
              <p className="px-4 py-4 text-[11.5px] text-txt3">مفيش بيانات لسه</p>
            )}
            {stats.topUsers.map((u, i) => {
              const pct = usagePercent(u.usedTokens, u.totalAllocatedTokens);
              return (
                <button
                  key={u.id}
                  onClick={() => onSelectUser(u.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition-colors hover:bg-panel2"
                >
                  <span className="mono w-5 shrink-0 text-[11px] text-txt3">#{i + 1}</span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green/15 text-[11px] font-bold text-green">
                    {initialOf(u.displayName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-txt">{u.displayName}</span>
                    <span className="mono block truncate text-[10.5px] text-txt3" dir="ltr">
                      {u.email}
                    </span>
                  </span>
                  <span className="shrink-0 text-left">
                    <span className="mono block text-[11.5px] text-amber">
                      {formatTokens(u.usedTokens)}
                    </span>
                    <span className="mono block text-[10px] text-txt3">{pct}%</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* أحدث المسجلين */}
        <div className="rounded-lg border border-line bg-panel">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <UserPlus size={14} className="text-green" />
            <h2 className="text-[12.5px] font-bold text-txt">أحدث المستخدمين</h2>
          </div>
          <div className="divide-y divide-line">
            {stats.recentUsers.length === 0 && (
              <p className="px-4 py-4 text-[11.5px] text-txt3">مفيش مستخدمين لسه</p>
            )}
            {stats.recentUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => onSelectUser(u.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-right transition-colors hover:bg-panel2"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan/15 text-[11px] font-bold text-cyan">
                  {initialOf(u.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-txt">{u.displayName}</span>
                  <span className="mono block truncate text-[10.5px] text-txt3" dir="ltr">
                    {u.email}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-txt3">
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