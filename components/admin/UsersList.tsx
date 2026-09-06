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
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${className}`}>{children}</span>
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
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line2 bg-panel px-3 py-2 focus-within:border-green/40">
          <Search size={15} className="shrink-0 text-txt3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="دور بالاسم أو البريد الإلكتروني…"
            className="w-full bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
          />
        </div>
        <button
          onClick={() => load(q)}
          title="تحديث القايمة"
          className="shrink-0 rounded-md border border-line2 bg-panel p-2 text-txt2 transition-colors hover:text-green"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <p className="mono text-[11px] text-txt3">
        {loading ? "جاري التحميل…" : `${formatTokens(users.length)} مستخدم`}
      </p>

      {error && (
        <div className="rounded-lg border border-rose/40 bg-rose/5 p-4 text-center text-xs text-rose">
          {error}
        </div>
      )}

      {/* قايمة المستخدمين */}
      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        {users.length === 0 && !loading && !error && (
          <p className="px-4 py-8 text-center text-[12px] text-txt3">
            {q ? `مفيش نتائج للبحث عن "${q}"` : "مفيش مستخدمين مسجلين لسه"}
          </p>
        )}
        <div className="divide-y divide-line">
          {users.map((u) => {
            const pct = usagePercent(u.usedTokens, u.totalAllocatedTokens);
            return (
              <button
                key={u.id}
                onClick={() => onSelect(u.id)}
                className="flex w-full items-center gap-3 px-3 py-3 text-right transition-colors hover:bg-panel2 md:px-4"
              >
                {/* avatar */}
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
                    u.isAdmin
                      ? "bg-purple/15 text-purple"
                      : u.isBanned
                        ? "bg-rose/15 text-rose"
                        : "bg-green/15 text-green"
                  }`}
                >
                  {initialOf(u.displayName)}
                </span>

                {/* الاسم والإيميل */}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-bold text-txt">
                      {u.displayName}
                    </span>
                    {u.isAdmin && <Badge className="bg-purple/15 text-purple">أدمن</Badge>}
                    {u.isBanned && <Badge className="bg-rose/15 text-rose">محظور</Badge>}
                  </span>
                  <span className="mono block truncate text-[10.5px] text-txt3" dir="ltr">
                    {u.email}
                  </span>
                </span>

                {/* الرصيد */}
                <span className="hidden w-36 shrink-0 sm:block">
                  <span className="mono mb-1 flex items-center justify-between text-[10px] text-txt3">
                    <span className="text-amber">{formatTokens(u.usedTokens)} مستخدم</span>
                    <span>{pct}%</span>
                  </span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-panel3">
                    <span
                      className={`block h-full rounded-full ${
                        pct >= 90 ? "bg-rose" : pct >= 60 ? "bg-amber" : "bg-green"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                </span>

                {/* أرقام سريعة */}
                <span className="hidden shrink-0 items-center gap-3 text-[10.5px] text-txt3 md:flex">
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

                <ChevronLeft size={15} className="shrink-0 text-txt3" />
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-center text-[10.5px] text-txt3">
        اضغط على أي مستخدم لعرض كل تفاصيله وإدارة حسابه
      </p>
    </div>
  );
}