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
    <button onClick={copyId} title="نسخ الـ ID" className="text-txt3 hover:text-green">
      {copied ? <Hash size={11} className="text-green" /> : <Copy size={11} />}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-txt3">
        <Loader2 size={18} className="animate-spin text-green" />
        <span className="text-xs">جاري تحميل بيانات المستخدم…</span>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="rounded-lg border border-rose/40 bg-rose/5 p-6 text-center">
        <p className="mb-3 text-xs text-rose">{error || "المستخدم غير موجود"}</p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={load}
            className="rounded-md bg-green/15 px-4 py-2 text-[12px] font-bold text-green hover:bg-green/25"
          >
            إعادة المحاولة
          </button>
          <button
            onClick={onBack}
            className="rounded-md border border-line2 px-4 py-2 text-[12px] text-txt2 hover:text-txt"
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
        className="flex items-center gap-1.5 text-[12px] text-txt3 transition-colors hover:text-txt"
      >
        <ChevronRight size={14} />
        رجوع لقايمة المستخدمين
      </button>

      {/* بطاقة المستخدم */}
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold ${
              user.isAdmin
                ? "bg-purple/15 text-purple"
                : user.isBanned
                  ? "bg-rose/15 text-rose"
                  : "bg-green/15 text-green"
            }`}
          >
            {initialOf(user.displayName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[15px] font-bold text-txt">{user.displayName}</h2>
              {user.isAdmin && (
                <span className="rounded bg-purple/15 px-1.5 py-0.5 text-[10px] font-bold text-purple">
                  أدمن
                </span>
              )}
              {user.isBanned ? (
                <span className="rounded bg-rose/15 px-1.5 py-0.5 text-[10px] font-bold text-rose">
                  محظور
                </span>
              ) : (
                <span className="rounded bg-green/15 px-1.5 py-0.5 text-[10px] font-bold text-green">
                  نشط
                </span>
              )}
            </div>
            <div className="mono mt-0.5 flex items-center gap-1 text-[11.5px] text-txt2" dir="ltr">
              <Mail size={11} className="shrink-0" />
              {user.email}
            </div>
            <div className="mono mt-0.5 flex items-center gap-1 text-[10px] text-txt3">
              <Fingerprint size={10} className="shrink-0" />
              <span className="truncate" dir="ltr">
                {user.id}
              </span>
              {copyBtn}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[11px] text-txt3">
          <span className="flex items-center gap-1">
            <CalendarClock size={11} />
            مسجل من {formatDateTime(user.createdAt)}
          </span>
          {user.isBanned && user.bannedAt && (
            <span className="flex items-center gap-1 text-rose">
              <Ban size={11} />
              اتحظر {timeAgo(user.bannedAt)}
            </span>
          )}
          <span>آخر نشاط على الرصيد: {timeAgo(user.quotaUpdatedAt)}</span>
        </div>
      </div>

      {/* بطاقة الرصيد */}
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins size={15} className="text-amber" />
            <h3 className="text-[13px] font-bold text-txt">رصيد التوكنز</h3>
          </div>
          <span
            className={`mono rounded px-2 py-0.5 text-[11px] font-bold ${
              remaining === 0 ? "bg-rose/15 text-rose" : "bg-green/15 text-green"
            }`}
          >
            متبقي: {formatTokens(remaining)}
          </span>
        </div>

        <div className="mb-2 h-3 overflow-hidden rounded-full bg-panel3">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 90 ? "bg-rose" : pct >= 60 ? "bg-amber" : "bg-gradient-to-l from-green to-cyan"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-line bg-panel2 px-2 py-2">
            <p className="mono text-[13px] font-bold text-amber">{formatTokens(user.usedTokens)}</p>
            <p className="text-[10px] text-txt3">مستهلك</p>
          </div>
          <div className="rounded-md border border-line bg-panel2 px-2 py-2">
            <p className="mono text-[13px] font-bold text-cyan">{formatTokens(user.totalAllocatedTokens)}</p>
            <p className="text-[10px] text-txt3">إجمالي الرصيد</p>
          </div>
          <div className="rounded-md border border-line bg-panel2 px-2 py-2">
            <p className="mono text-[13px] font-bold text-green">{pct}%</p>
            <p className="text-[10px] text-txt3">نسبة الاستهلاك</p>
          </div>
        </div>

        {user.quotaExhaustedAt && (
          <p className="mt-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-1.5 text-[11px] text-amber">
            نفد رصيده واتسجل نفاد التوكنز في {formatDateTime(user.quotaExhaustedAt)}
          </p>
        )}
      </div>

      {/* بطاقة رصيد الـ API — منفصلة تمامًا عن رصيد الشات فوق، وبتقرأ من نفس
          المصدر اللي صفحة API بتاعة المستخدم بتعرضه، فأي شحن هنا بيظهر عنده فورًا */}
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound size={15} className="text-green" />
            <h3 className="text-[13px] font-bold text-txt">رصيد الـ API (منفصل عن رصيد الشات)</h3>
          </div>
          <span
            className={`mono rounded px-2 py-0.5 text-[11px] font-bold ${
              apiRemaining === 0 ? "bg-rose/15 text-rose" : "bg-green/15 text-green"
            }`}
          >
            متبقي: {formatTokens(apiRemaining)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
          <div className="rounded-md border border-line bg-panel2 px-2 py-2">
            <p className="mono text-[13px] font-bold text-amber">{formatTokens(user.apiUsedTokens)}</p>
            <p className="text-[10px] text-txt3">مستهلك</p>
          </div>
          <div className="rounded-md border border-line bg-panel2 px-2 py-2">
            <p className="mono text-[13px] font-bold text-cyan">
              {formatTokens(user.apiTotalAllocatedTokens)}
            </p>
            <p className="text-[10px] text-txt3">إجمالي الرصيد</p>
          </div>
          <div className="rounded-md border border-line bg-panel2 px-2 py-2 sm:block">
            <p className="mono text-[13px] font-bold text-green">{formatTokens(apiRemaining)}</p>
            <p className="text-[10px] text-txt3">متبقي</p>
          </div>
        </div>
      </div>

      {/* أزرار الإجراءات */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setShowRechargeModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-cyan/15 px-3.5 py-2.5 text-[12px] font-bold text-cyan transition-colors hover:bg-cyan/25"
        >
          <Zap size={14} />
          شحن توكنز
        </button>

        <button
          onClick={() => setShowApiRechargeModal(true)}
          className="flex items-center gap-1.5 rounded-md bg-green/15 px-3.5 py-2.5 text-[12px] font-bold text-green transition-colors hover:bg-green/25"
        >
          <KeyRound size={14} />
          شحن رصيد API
        </button>

        {user.isBanned ? (
          <button
            onClick={() => setShowBanModal(true)}
            disabled={user.isAdmin || isSelf || actionLoading}
            className="flex items-center gap-1.5 rounded-md bg-green/15 px-3.5 py-2.5 text-[12px] font-bold text-green transition-colors hover:bg-green/25 disabled:opacity-40"
          >
            <UserCheck size={14} />
            فك الحظر
          </button>
        ) : (
          <button
            onClick={() => setShowBanModal(true)}
            disabled={user.isAdmin || isSelf || actionLoading}
            className="flex items-center gap-1.5 rounded-md bg-amber/15 px-3.5 py-2.5 text-[12px] font-bold text-amber transition-colors hover:bg-amber/25 disabled:opacity-40"
          >
            <UserX size={14} />
            حظر الحساب
          </button>
        )}

        <button
          onClick={() => setShowDeleteModal(true)}
          disabled={user.isAdmin || isSelf || actionLoading}
          className="flex items-center gap-1.5 rounded-md bg-rose/15 px-3.5 py-2.5 text-[12px] font-bold text-rose transition-colors hover:bg-rose/25 disabled:opacity-40"
          title={user.isAdmin ? "حسابات الأدمن محمية" : undefined}
        >
          <Trash2 size={14} />
          حذف الحساب
        </button>

        {(user.isAdmin || isSelf) && (
          <span className="flex items-center gap-1.5 rounded-md border border-line2 px-3 py-2.5 text-[11px] text-txt3">
            <ShieldAlert size={13} />
            حسابات الأدمن محمية من الحظر والحذف
          </span>
        )}
      </div>

      {/* المحادثات */}
      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={14} className="text-cyan" />
            <h3 className="text-[12.5px] font-bold text-txt">
              المحادثات ({formatTokens(user.sessionsCount)})
            </h3>
          </div>
          <button onClick={load} title="تحديث" className="text-txt3 hover:text-txt">
            <RefreshCw size={13} />
          </button>
        </div>
        {sessions.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11.5px] text-txt3">مفيش محادثات</p>
        ) : (
          <div className="max-h-72 divide-y divide-line overflow-y-auto">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-txt">{s.title}</span>
                  <span className="mono block text-[10px] text-txt3">
                    {s.messagesCount} رسالة • {formatTokens(s.tokensUsed)} توكنز
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-txt3">{timeAgo(s.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* آخر الرسايل */}
      <div className="overflow-hidden rounded-lg border border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <MessagesSquare size={14} className="text-purple" />
          <h3 className="text-[12.5px] font-bold text-txt">آخر الرسايل (20)</h3>
        </div>
        {messages.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11.5px] text-txt3">مفيش رسايل</p>
        ) : (
          <div className="max-h-96 divide-y divide-line overflow-y-auto">
            {messages.map((m) => (
              <div key={m.id} className="px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[9.5px] font-bold ${
                      m.role === "user"
                        ? "bg-cyan/15 text-cyan"
                        : "bg-green/15 text-green"
                    }`}
                  >
                    {m.role === "user" ? "المستخدم" : "mlag"}
                  </span>
                  <span className="mono min-w-0 flex-1 truncate text-[10px] text-txt3">
                    {m.sessionTitle}
                  </span>
                  <span className="mono shrink-0 text-[10px] text-amber">
                    {formatTokens(m.tokensUsed)} توكنز
                  </span>
                  <span className="shrink-0 text-[10px] text-txt3">{timeAgo(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-[11.5px] leading-5 text-txt2">
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