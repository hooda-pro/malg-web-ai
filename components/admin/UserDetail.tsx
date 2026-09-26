"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  CalendarClock,
  ChevronRight,
  Coins,
  Copy,
  Fingerprint,
  Hash,
  KeyRound,
  Loader2,
  Mail,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Zap,
} from "lucide-react";
import { formatTokens } from "@/lib/ai";
import type { AdminMessageRow, AdminSessionRow, AdminUserDetail } from "./adminTypes";
import { formatDateTime, initialOf, timeAgo, truncate, usagePercent } from "./helpers";
import ConfirmModal from "./ConfirmModal";
import TokenRechargeModal from "./TokenRechargeModal";
import ApiTokenRechargeModal from "./ApiTokenRechargeModal";

type NotifyFn = (type: "ok" | "err", text: string) => void;

export default function UserDetail({
  userId,
  isSelf,
  onBack,
  notify,
}: {
  userId: string;
  isSelf: boolean;
  onBack: () => void;
  notify: NotifyFn;
}) {
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [sessions, setSessions] = useState<AdminSessionRow[]>([]);
  const [messages, setMessages] = useState<AdminMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [showBanModal, setShowBanModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [showApiRechargeModal, setShowApiRechargeModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحميل بيانات المستخدم");
      setUser(data.user);
      setSessions(data.sessions || []);
      setMessages(data.messages || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل بيانات المستخدم");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const copyId = async () => {
    if (!user) return;
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // تجاهل
    }
  };

  const toggleBan = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned: !user.isBanned }),
      });
      const data = await res.json();
      if (!res.ok) {
        notify("err", data.error || "فشلت العملية");
        return;
      }
      notify("ok", !user.isBanned ? "تم حظر الحساب ✓" : "تم فك حظر الحساب ✓");
      setShowBanModal(false);
      await load();
    } catch {
      notify("err", "مشكلة في الاتصال — حاول تاني");
    } finally {
      setActionLoading(false);
    }
  };

  const deleteUser = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        notify("err", data.error || "فشل حذف الحساب");
        return;
      }
      notify("ok", `تم حذف حساب ${user.displayName} نهائيًا ✓`);
      onBack();
    } catch {
      notify("err", "مشكلة في الاتصال — حاول تاني");
    } finally {
      setActionLoading(false);
    }
  };

  const copyBtn = (
    <button onClick={copyId} title="نسخ الـ ID" className="text-ink-3 hover:text-accent">
      {copied ? <Hash size={11} className="text-accent" /> : <Copy size={11} />}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-3">
        <Loader2 size={18} className="animate-spin text-accent" />
        <span className="text-[13px]">جاري تحميل بيانات المستخدم…</span>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="rounded-lg border border-hair bg-danger-soft p-6 text-center">
        <p className="mb-3 text-[13px] text-danger">{error || "المستخدم غير موجود"}</p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={load}
            className="rounded-md bg-accent-soft px-4 py-2 text-[13px] font-semibold text-accent hover:bg-accent-soft"
          >
            إعادة المحاولة
          </button>
          <button
            onClick={onBack}
            className="rounded-md border border-hair px-4 py-2 text-[13px] text-ink-2 hover:text-ink"
          >
            رجوع للقايمة
          </button>
        </div>
      </div>
    );
  }

  const remaining = Math.max(user.totalAllocatedTokens - user.usedTokens, 0);
  const pct = usagePercent(user.usedTokens, user.totalAllocatedTokens);
  const apiRemaining = Math.max(user.apiTotalAllocatedTokens - user.apiUsedTokens, 0);

  return (
    <div className="space-y-4">
      {/* زر الرجوع */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
      >
        <ChevronRight size={14} />
        رجوع لقايمة المستخدمين
      </button>

      {/* بطاقة المستخدم */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${
              user.isAdmin
                ? "bg-accent-soft text-accent"
                : user.isBanned
                  ? "bg-danger-soft text-danger"
                  : "bg-accent-soft text-accent"
            }`}
          >
            {initialOf(user.displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[15px] font-semibold text-ink">{user.displayName}</h2>
              {user.isAdmin && (
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                  أدمن
                </span>
              )}
              {user.isBanned ? (
                <span className="rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger">
                  محظور
                </span>
              ) : (
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">
                  نشط
                </span>
              )}
            </div>
            <div className="tnum mt-0.5 flex items-center gap-1 text-[12.5px] text-ink-2" dir="ltr">
              <Mail size={11} className="shrink-0" />
              {user.email}
            </div>
            <div className="tnum mt-0.5 flex items-center gap-1 text-[11px] text-ink-3">
              <Fingerprint size={10} className="shrink-0" />
              <span className="truncate" dir="ltr">
                {user.id}
              </span>
              {copyBtn}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-hair pt-3 text-[12px] text-ink-3">
          <span className="flex items-center gap-1">
            <CalendarClock size={11} />
            مسجل من {formatDateTime(user.createdAt)}
          </span>
          {user.isBanned && user.bannedAt && (
            <span className="flex items-center gap-1 text-danger">
              <Ban size={11} />
              اتحظر {timeAgo(user.bannedAt)}
            </span>
          )}
          <span>آخر نشاط على الرصيد: {timeAgo(user.quotaUpdatedAt)}</span>
        </div>
      </div>

      {/* بطاقة الرصيد */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins size={15} className="text-warn" />
            <h3 className="text-[13px] font-semibold text-ink">رصيد التوكنز</h3>
          </div>
          <span
            className={`tnum rounded px-2 py-0.5 text-[12px] font-semibold ${
              remaining === 0 ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
            }`}
          >
            متبقي: {formatTokens(remaining)}
          </span>
        </div>

        <div className="mb-2 h-3 overflow-hidden rounded-full bg-surface-3">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 90 ? "bg-danger" : pct >= 60 ? "bg-warn" : "bg-accent"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2">
            <p className="tnum text-[13px] font-semibold text-warn">{formatTokens(user.usedTokens)}</p>
            <p className="text-[11px] text-ink-3">مستهلك</p>
          </div>
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2">
            <p className="tnum text-[13px] font-semibold text-accent">{formatTokens(user.totalAllocatedTokens)}</p>
            <p className="text-[11px] text-ink-3">إجمالي الرصيد</p>
          </div>
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2">
            <p className="tnum text-[13px] font-semibold text-accent">{pct}%</p>
            <p className="text-[11px] text-ink-3">نسبة الاستهلاك</p>
          </div>
        </div>

        {user.quotaExhaustedAt && (
          <p className="mt-2 rounded-md border border-hair bg-warn-soft px-3 py-1.5 text-[12px] text-warn">
            نفد رصيده واتسجل نفاد التوكنز في {formatDateTime(user.quotaExhaustedAt)}
          </p>
        )}
      </div>

      {/* بطاقة رصيد الـ API — منفصلة تمامًا عن رصيد الشات فوق، وبتقرأ من نفس
          المصدر اللي صفحة API بتاعة المستخدم بتعرضه، فأي شحن هنا بيظهر عنده فورًا */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-accent" />
            <h3 className="text-[13px] font-semibold text-ink">رصيد الـ API (منفصل عن رصيد الشات)</h3>
          </div>
          <span
            className={`tnum rounded px-2 py-0.5 text-[12px] font-semibold ${
              apiRemaining === 0 ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
            }`}
          >
            متبقي: {formatTokens(apiRemaining)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2">
            <p className="tnum text-[13px] font-semibold text-warn">{formatTokens(user.apiUsedTokens)}</p>
            <p className="text-[11px] text-ink-3">مستهلك</p>
          </div>
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2">
            <p className="tnum text-[13px] font-semibold text-accent">
              {formatTokens(user.apiTotalAllocatedTokens)}
            </p>
            <p className="text-[11px] text-ink-3">إجمالي الرصيد</p>
          </div>
          <div className="rounded-md border border-hair bg-surface-2 px-2 py-2 sm:block">
            <p className="tnum text-[13px] font-semibold text-accent">{formatTokens(apiRemaining)}</p>
            <p className="text-[11px] text-ink-3">متبقي</p>
          </div>
        </div>
      </div>

      {/* أزرار الإجراءات */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowRechargeModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-accent-soft px-3.5 py-2.5 text-[13px] font-semibold text-accent transition-colors hover:bg-accent-soft"
        >
          <Zap size={14} />
          شحن توكنز
        </button>

        <button
          onClick={() => setShowApiRechargeModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2.5 text-[13px] font-medium text-accent-ink shadow-accent transition-colors hover:bg-accent-hover"
        >
          <KeyRound size={14} />
          شحن رصيد API
        </button>

        {user.isBanned ? (
          <button
            onClick={() => setShowBanModal(true)}
            disabled={user.isAdmin || isSelf || actionLoading}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2.5 text-[13px] font-medium text-accent-ink shadow-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <UserCheck size={14} />
            فك الحظر
          </button>
        ) : (
          <button
            onClick={() => setShowBanModal(true)}
            disabled={user.isAdmin || isSelf || actionLoading}
            className="flex items-center gap-1.5 rounded-md bg-warn-soft px-3.5 py-2.5 text-[13px] font-semibold text-warn transition-colors hover:bg-warn-soft disabled:opacity-40"
          >
            <UserX size={14} />
            حظر الحساب
          </button>
        )}

        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={user.isAdmin || isSelf || actionLoading}
          className="flex items-center gap-1.5 rounded-md bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger-soft disabled:opacity-40"
          title={user.isAdmin ? "حسابات الأدمن محمية" : undefined}
        >
          <Trash2 size={14} />
          حذف الحساب
        </button>

        {(user.isAdmin || isSelf) && (
          <span className="flex items-center gap-1.5 rounded-md border border-hair px-3 py-2.5 text-[12px] text-ink-3">
            <ShieldAlert size={13} />
            حسابات الأدمن محمية من الحظر والحذف
          </span>
        )}
      </div>

      {/* المحادثات */}
      <div className="overflow-hidden rounded-lg border border-hair bg-surface shadow-1">
        <div className="flex items-center justify-between border-b border-hair px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={14} className="text-accent" />
            <h3 className="text-[13.5px] font-semibold text-ink">
              المحادثات ({formatTokens(user.sessionsCount)})
            </h3>
          </div>
          <button onClick={load} title="تحديث" className="text-ink-3 hover:text-ink">
            <RefreshCw size={13} />
          </button>
        </div>
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">مفيش محادثات</p>
        ) : (
          <div className="max-h-72 divide-y divide-hair overflow-y-auto">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ink">{s.title}</span>
                  <span className="tnum block text-[11px] text-ink-3">
                    {s.messagesCount} رسالة • {formatTokens(s.tokensUsed)} توكنز
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(s.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* آخر الرسايل */}
      <div className="overflow-hidden rounded-lg border border-hair bg-surface shadow-1">
        <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
          <MessagesSquare size={14} className="text-accent" />
          <h3 className="text-[13.5px] font-semibold text-ink">آخر الرسايل (20)</h3>
        </div>
        {messages.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] text-ink-3">مفيش رسايل</p>
        ) : (
          <div className="max-h-96 divide-y divide-hair overflow-y-auto">
            {messages.map((m) => (
              <div key={m.id} className="px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                      m.role === "user"
                        ? "bg-accent-soft text-accent"
                        : "bg-accent-soft text-accent"
                    }`}
                  >
                    {m.role === "user" ? "المستخدم" : "mlag"}
                  </span>
                  <span className="tnum min-w-0 flex-1 truncate text-[11px] text-ink-3">
                    {m.sessionTitle}
                  </span>
                  <span className="tnum shrink-0 text-[11px] text-warn">
                    {formatTokens(m.tokensUsed)} توكنز
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3">{timeAgo(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-ink-2">
                  {truncate(m.content, 220)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ——— النوافذ ——— */}
      {showRechargeModal && (
        <TokenRechargeModal
          user={user}
          onClose={() => setShowRechargeModal(false)}
          onDone={() => {
            setShowRechargeModal(false);
            notify("ok", "تم تحديث رصيد التوكنز بنجاح ✓");
            load();
          }}
        />
      )}

      {showApiRechargeModal && (
        <ApiTokenRechargeModal
          user={user}
          onClose={() => setShowApiRechargeModal(false)}
          onDone={() => {
            setShowApiRechargeModal(false);
            notify("ok", "تم تحديث رصيد الـ API بنجاح ✓");
            load();
          }}
        />
      )}

      {showBanModal && (
        <ConfirmModal
          title={user.isBanned ? "فك حظر الحساب" : "حظر الحساب"}
          message={
            user.isBanned
              ? `هترجع المستخدم ${user.displayName} (${user.email}) يقدر يسجل دخول ويستخدم المنصة تاني.`
              : `هتمنع المستخدم ${user.displayName} (${user.email}) من تسجيل الدخول واستخدام المنصة بالكامل.`
          }
          confirmLabel={user.isBanned ? "فك الحظر" : "تأكيد الحظر"}
          danger={!user.isBanned}
          onConfirm={toggleBan}
          onClose={() => setShowBanModal(false)}
        />
      )}

      {showDeleteModal && (
        <ConfirmModal
          title="حذف الحساب نهائيًا"
          message={`تحذير: هيتحذف حساب ${user.displayName} (${user.email}) مع كل محادثاته ورسايله ورصيده نهائيًا — مش هينفع ترجعه تاني.`}
          confirmLabel="حذف نهائي"
          danger
          requireText={user.email}
          onConfirm={deleteUser}
          onClose={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}