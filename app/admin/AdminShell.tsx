"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  LogOut,
  Search,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Controls";
import Toast from "@/components/Toast";
import { cn } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  sessionCount: number;
  messageTokens: number;
  chatQuota: { total: number; used: number; remaining: number };
  apiQuota: { total: number; used: number; remaining: number };
}

interface Stats {
  users: number;
  admins: number;
  newUsers: number;
  sessions: number;
  messages: number;
  activeKeys: number;
  chatTokensUsed: number;
  chatTokensAllocated: number;
  apiTokensUsed: number;
  apiTokensAllocated: number;
}

interface LogEntry {
  id: string;
  adminEmail: string;
  action: string;
  targetEmail: string | null;
  details: string | null;
  createdAt: string;
}

type Tab = "overview" | "users" | "logs";

const ACTION_LABELS: Record<string, string> = {
  "quota.chat.set": "تعديل رصيد الشات",
  "quota.api.set": "تعديل رصيد الـ API",
  "user.promote": "منح صلاحية أدمن",
  "user.demote": "سحب صلاحية أدمن",
  "user.rename": "تغيير الاسم",
  "user.delete": "حذف حساب",
};

export default function AdminShell({
  admin,
}: {
  admin: { id: string; email: string; displayName: string };
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const show = useCallback((msg: string) => setToast(msg), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, u, l] = await Promise.all([
        fetch("/api/admin/stats").then((r) => r.json()),
        fetch(`/api/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`).then((r) => r.json()),
        fetch("/api/admin/logs?limit=60").then((r) => r.json()),
      ]);
      if (s.stats) setStats(s.stats);
      if (u.users) setUsers(u.users);
      if (l.logs) setLogs(l.logs);
      if (s.error || u.error) show(s.error || u.error);
    } catch {
      show("تعذر تحميل البيانات — تأكد من الاتصال");
    } finally {
      setLoading(false);
    }
  }, [query, show]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchUser = async (id: string, body: Record<string, unknown>, successMsg: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || "فشل التعديل");
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data.user } : u)));
      show(successMsg);
    } catch {
      show("فشل الاتصال بالسيرفر");
    } finally {
      setBusyId(null);
    }
  };

  const deleteUser = async (id: string, email: string) => {
    if (
      !window.confirm(
        `متأكد إنك عايز تحذف حساب ${email}؟\nكل المحادثات والأرصدة هتتمسح نهائياً.`
      )
    ) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        show(data.error || "فشل الحذف");
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      show("تم حذف الحساب");
    } catch {
      show("فشل الاتصال بالسيرفر");
    } finally {
      setBusyId(null);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <div className="min-h-[100dvh] bg-ground">
      <header className="glass sticky top-0 z-nav flex h-14 items-center gap-3 border-b border-hair px-4 sm:px-6">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-accent-ink shadow-accent">
          <ShieldCheck size={15} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-title text-ink">لوحة تحكم mlag</p>
          <p className="truncate text-[11px] tracking-label text-ink-3" dir="ltr">
            {admin.email}
          </p>
        </div>

        <div className="ms-auto flex items-center gap-1.5">
          <Link href="/">
            <Button size="sm" variant="ghost">
              الموقع
              <ArrowRight size={14} className="flip-rtl" />
            </Button>
          </Link>
          <IconButton label="تسجيل الخروج" onClick={logout} size="sm">
            <LogOut size={15} />
          </IconButton>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6">
        <div className="mb-6 inline-flex items-center gap-0.5 rounded-full bg-surface-3 p-1">
          {(
            [
              { value: "overview", label: "نظرة عامة", icon: Activity },
              { value: "users", label: "المستخدمون", icon: Users },
              { value: "logs", label: "السجل", icon: KeyRound },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all duration-2 ease-soft",
                  tab === t.value ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:text-ink"
                )}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid place-items-center py-20 text-ink-3">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : tab === "overview" ? (
          <Overview stats={stats} />
        ) : tab === "users" ? (
          <UsersTab
            users={users}
            query={query}
            onQuery={setQuery}
            busyId={busyId}
            selfId={admin.id}
            onPatch={patchUser}
            onDelete={deleteUser}
          />
        ) : (
          <LogsTab logs={logs} />
        )}
      </main>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* ============================================================================
   نظرة عامة — أرقام المنصة في كروت + شريط استهلاك التوكنز
   ========================================================================= */

function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent";
}) {
  return (
    <div className="rounded-xl border border-hair bg-surface p-4 shadow-1">
      <p className="text-[12px] tracking-label text-ink-3">{label}</p>
      <p
        className={cn(
          "tnum mt-1.5 text-[26px] font-semibold leading-none tracking-display",
          tone === "accent" ? "text-accent" : "text-ink"
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[11.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

function Overview({ stats }: { stats: Stats | null }) {
  if (!stats) {
    return <p className="py-16 text-center text-[14px] text-ink-3">مفيش بيانات لعرضها</p>;
  }

  const chatPct =
    stats.chatTokensAllocated > 0
      ? Math.min((stats.chatTokensUsed / stats.chatTokensAllocated) * 100, 100)
      : 0;
  const apiPct =
    stats.apiTokensAllocated > 0
      ? Math.min((stats.apiTokensUsed / stats.apiTokensAllocated) * 100, 100)
      : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="إجمالي المستخدمين" value={String(stats.users)} hint={`+${stats.newUsers} آخر ٧ أيام`} tone="accent" />
        <StatCard label="المحادثات" value={String(stats.sessions)} hint={`${stats.messages} رسالة`} />
        <StatCard label="الأدمن" value={String(stats.admins)} />
        <StatCard label="مفاتيح API نشطة" value={String(stats.activeKeys)} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-hair bg-surface p-5 shadow-1">
          <p className="text-[13px] font-medium text-ink">استهلاك رصيد الشات</p>
          <p className="tnum mt-1 text-[12px] text-ink-3">
            {stats.chatTokensUsed.toLocaleString("en-US")} من{" "}
            {stats.chatTokensAllocated.toLocaleString("en-US")} توكن
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-inset">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-3 ease-soft"
              style={{ width: `${chatPct}%` }}
            />
          </div>
          <p className="tnum mt-2 text-[11.5px] text-ink-3">{chatPct.toFixed(1)}% مستهلك</p>
        </div>

        <div className="rounded-xl border border-hair bg-surface p-5 shadow-1">
          <p className="text-[13px] font-medium text-ink">استهلاك رصيد الـ API</p>
          <p className="tnum mt-1 text-[12px] text-ink-3">
            {stats.apiTokensUsed.toLocaleString("en-US")} من{" "}
            {stats.apiTokensAllocated.toLocaleString("en-US")} توكن
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-inset">
            <div
              className="h-full rounded-full bg-live transition-[width] duration-3 ease-soft"
              style={{ width: `${apiPct}%` }}
            />
          </div>
          <p className="tnum mt-2 text-[11.5px] text-ink-3">{apiPct.toFixed(1)}% مستهلك</p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   المستخدمون — بحث + تعديل الأرصدة + الصلاحيات
   ========================================================================= */

function UsersTab({
  users,
  query,
  onQuery,
  busyId,
  selfId,
  onPatch,
  onDelete,
}: {
  users: AdminUser[];
  query: string;
  onQuery: (q: string) => void;
  busyId: string | null;
  selfId: string;
  onPatch: (id: string, body: Record<string, unknown>, msg: string) => Promise<void>;
  onDelete: (id: string, email: string) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 start-3 -translate-y-1/2 text-ink-3"
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="ابحث بالإيميل أو الاسم..."
          dir="ltr"
          className="h-10 w-full rounded-full border border-hair bg-surface ps-9 pe-4 text-[14px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
        />
      </div>

      {users.length === 0 ? (
        <p className="py-16 text-center text-[14px] text-ink-3">مفيش مستخدمين مطابقين</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-hair bg-surface shadow-1">
          {users.map((u, i) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === selfId}
              busy={busyId === u.id}
              first={i === 0}
              onPatch={onPatch}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  busy,
  first,
  onPatch,
  onDelete,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  first: boolean;
  onPatch: (id: string, body: Record<string, unknown>, msg: string) => Promise<void>;
  onDelete: (id: string, email: string) => Promise<void>;
}) {
  const [chat, setChat] = useState(String(user.chatQuota.total));
  const [api, setApi] = useState(String(user.apiQuota.total));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setChat(String(user.chatQuota.total));
    setApi(String(user.apiQuota.total));
  }, [user.chatQuota.total, user.apiQuota.total]);

  return (
    <div className={cn(!first && "border-t border-hair")}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
          {user.isAdmin ? <ShieldCheck size={15} /> : user.displayName[0]?.toUpperCase() ?? "?"}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[14px] font-medium text-ink">
            {user.displayName}
            {isSelf && (
              <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-3">أنت</span>
            )}
          </p>
          <p className="truncate text-[12px] text-ink-3" dir="ltr">
            {user.email}
          </p>
        </div>

        <div className="hidden text-[12px] text-ink-3 sm:block">
          <span className="tnum">{user.sessionCount}</span> محادثة
        </div>

        <div className="tnum hidden text-[12px] text-ink-3 md:block" title="رصيد الشات المتبقي">
          شات: {user.chatQuota.remaining.toLocaleString("en-US")}
        </div>

        <div className="tnum hidden text-[12px] text-ink-3 md:block" title="رصيد الـ API المتبقي">
          API: {user.apiQuota.remaining.toLocaleString("en-US")}
        </div>

        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? "إقفال" : "إدارة"}
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-hair bg-surface-2 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-ink-2">رصيد الشات (توكن)</span>
              <input
                type="number"
                min={0}
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                className="h-10 w-full rounded-md border border-hair bg-surface px-3 text-[14px] text-ink focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] text-ink-2">رصيد الـ API (توكن)</span>
              <input
                type="number"
                min={0}
                value={api}
                onChange={(e) => setApi(e.target.value)}
                className="h-10 w-full rounded-md border border-hair bg-surface px-3 text-[14px] text-ink focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() =>
                onPatch(
                  user.id,
                  { chatQuotaTotal: Number(chat) || 0, apiQuotaTotal: Number(api) || 0 },
                  "تم تحديث الأرصدة"
                )
              }
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              حفظ الأرصدة
            </Button>

            <Button
              size="sm"
              variant="secondary"
              disabled={busy || isSelf}
              title={isSelf ? "مينفعش تشيل صلاحيتك عن نفسك" : undefined}
              onClick={() =>
                onPatch(
                  user.id,
                  { isAdmin: !user.isAdmin },
                  user.isAdmin ? "تم سحب صلاحية الأدمن" : "تم منح صلاحية الأدمن"
                )
              }
            >
              <ShieldCheck size={14} />
              {user.isAdmin ? "إزالة الأدمن" : "اجعله أدمن"}
            </Button>

            <Button
              size="sm"
              variant="danger"
              disabled={busy || isSelf}
              title={isSelf ? "مينفعش تحذف حسابك" : undefined}
              onClick={() => onDelete(user.id, user.email)}
            >
              <Trash2 size={14} />
              حذف
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   السجل — إجراءات الأدمن آخر 60
   ========================================================================= */

function LogsTab({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) {
    return <p className="py-16 text-center text-[14px] text-ink-3">مفيش إجراءات لسه</p>;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hair bg-surface shadow-1">
      {logs.map((l, i) => (
        <div
          key={l.id}
          className={cn(
            "flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3",
            !i && "border-b border-hair",
            i > 0 && "border-t border-hair"
          )}
        >
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent">
            {ACTION_LABELS[l.action] || l.action}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2" dir="auto">
            {l.targetEmail || "—"}
            {l.details && <span className="text-ink-3"> · {l.details}</span>}
          </span>
          <span className="text-[11.5px] text-ink-3" dir="ltr">
            {l.adminEmail}
          </span>
          <span className="tnum shrink-0 text-[11.5px] text-ink-3">
            {new Date(l.createdAt).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" })}
          </span>
        </div>
      ))}
    </div>
  );
}

