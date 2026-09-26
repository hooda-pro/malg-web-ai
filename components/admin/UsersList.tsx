"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { formatTokens } from "@/lib/ai";
import type { AdminUserRow } from "./adminTypes";
import { formatDate, initialOf, usagePercent } from "./helpers";

/** شارة حالة صغيرة */
function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>{children}</span>
  );
}

export default function UsersList({ onSelect }: { onSelect: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحميل المستخدمين");
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل المستخدمين");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => load(q), 300); // بحث مع debounce
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="space-y-4">
      {/* شريط البحث */}
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-hair bg-surface px-3 py-2 focus-within:border-accent-line">
          <Search size={15} className="shrink-0 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="دور بالاسم أو البريد الإلكتروني…"
            className="w-full bg-transparent text-[13.5px] text-ink placeholder:text-ink-3 focus:outline-none"
          />
        </div>
        <button
          onClick={() => load(q)}
          title="تحديث القايمة"
          className="shrink-0 rounded-md border border-hair bg-surface p-2 text-ink-2 transition-colors hover:text-accent"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <p className="tnum text-[12px] text-ink-3">
        {loading ? "جاري التحميل…" : `${formatTokens(users.length)} مستخدم`}
      </p>

      {error && (
        <div className="rounded-lg border border-hair bg-danger-soft p-4 text-center text-[13px] text-danger">
          {error}
        </div>
      )}

      {/* قايمة المستخدمين */}
      <div className="overflow-hidden rounded-lg border border-hair bg-surface shadow-1">
        {users.length === 0 && !loading && !error && (
          <p className="px-4 py-8 text-center text-[13px] text-ink-3">
            {q ? `مفيش نتائج للبحث عن "${q}"` : "مفيش مستخدمين مسجلين لسه"}
          </p>
        )}
        <div className="divide-y divide-hair">
          {users.map((u) => {
            const pct = usagePercent(u.usedTokens, u.totalAllocatedTokens);
            return (
              <button
                key={u.id}
                onClick={() => onSelect(u.id)}
                className="flex w-full items-center gap-3 px-3 py-3 text-right transition-colors hover:bg-surface-2 md:px-4"
              >
                {/* avatar */}
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold ${
                    u.isAdmin
                      ? "bg-accent-soft text-accent"
                      : u.isBanned
                        ? "bg-danger-soft text-danger"
                        : "bg-accent-soft text-accent"
                  }`}
                >
                  {initialOf(u.displayName)}
                </span>

                {/* الاسم والإيميل */}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold text-ink">
                      {u.displayName}
                    </span>
                    {u.isAdmin && <Badge className="bg-accent-soft text-accent">أدمن</Badge>}
                    {u.isBanned && <Badge className="bg-danger-soft text-danger">محظور</Badge>}
                  </span>
                  <span className="tnum block truncate text-[11.5px] text-ink-3" dir="ltr">
                    {u.email}
                  </span>
                </span>

                {/* الرصيد */}
                <span className="hidden w-36 shrink-0 sm:block">
                  <span className="tnum mb-1 flex items-center justify-between text-[11px] text-ink-3">
                    <span className="text-warn">{formatTokens(u.usedTokens)} مستخدم</span>
                    <span>{pct}%</span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className={`block h-full rounded-full ${
                        pct >= 90 ? "bg-danger" : pct >= 60 ? "bg-warn" : "bg-accent"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </span>

                {/* أرقام سريعة */}
                <span className="hidden shrink-0 items-center gap-3 text-[11.5px] text-ink-3 md:flex">
                  <span className="flex items-center gap-1" title="المحادثات">
                    <MessageCircle size={11} />
                    {formatTokens(u.sessionsCount)}
                  </span>
                  <span className="flex items-center gap-1" title="الرسائل">
                    <MessagesSquare size={11} />
                    {formatTokens(u.messagesCount)}
                  </span>
                  <span title="تاريخ التسجيل">{formatDate(u.createdAt)}</span>
                </span>

                <ChevronLeft size={15} className="shrink-0 text-ink-3" />
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[11.5px] text-ink-3">
        اضغط على أي مستخدم لعرض كل تفاصيله وإدارة حسابه
      </p>
    </div>
  );
}