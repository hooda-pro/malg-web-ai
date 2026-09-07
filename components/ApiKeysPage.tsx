"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Coins,
  Copy,
  KeyRound,
  Loader2,
  MessageCircle,
  Plus,
  ShieldAlert,
  Terminal,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { formatTokens } from "@/lib/ai";
import { AVAILABLE_MODELS } from "./SettingsContext";
import {
  API_TOKEN_PRICE_PER_MILLION,
  buildApiRechargeMessage,
  buildWhatsAppLink,
} from "@/lib/recharge";
import ConfirmModal from "./admin/ConfirmModal";
import { formatDateTime, timeAgo } from "./admin/helpers";

interface ApiKeyRow {
  id: string;
  label: string;
  keyPrefix: string;
  modelId: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface ApiQuota {
  total: number;
  used: number;
}

/** كميات سريعة لشحن رصيد الـ API — بنفس السعر المرجعي (300 جنيه/مليون) */
const QUICK_AMOUNTS = [1_000_000, 5_000_000, 10_000_000];

function priceFor(tokens: number): number {
  return Math.round((tokens / 1_000_000) * API_TOKEN_PRICE_PER_MILLION);
}

/**
 * صفحة "API للمطورين" — مستخدم مسجّل يعمل منها مفاتيح API يستخدمها في
 * تطبيقاته الخاصة، برصيد منفصل تمامًا عن رصيد الشات العادي. صفحة عربية
 * بالكامل بنفس أسلوب RechargeModal (من غير أي ترجمة متعددة اللغات).
 */
export default function ApiKeysPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [quota, setQuota] = useState<ApiQuota | null>(null);

  const [origin, setOrigin] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newModelId, setNewModelId] = useState(AVAILABLE_MODELS[0].id);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [justCreated, setJustCreated] = useState<{ fullKey: string; label: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<ApiKeyRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const notify = useCallback((type: "ok" | "err", text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice((n) => (n?.text === text ? null : n)), 3500);
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        setUser(data.user || null);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/api-keys");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحميل بيانات صفحة API");
      setKeys(data.keys || []);
      if (data.quota) {
        setQuota({ total: data.quota.totalAllocatedTokens, used: data.quota.usedTokens });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "فشل تحميل بيانات صفحة API");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadKeys();
  }, [authChecked, user, loadKeys]);

  const openWhatsApp = (tokens: number | null) => {
    const url = buildWhatsAppLink(buildApiRechargeMessage(tokens, user));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyFullKey = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(true);
      window.setTimeout(() => setCopiedKey(false), 1500);
    } catch {
      // تجاهل
    }
  };

  const createKey = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), model_id: newModelId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error || "فشل إنشاء المفتاح");
        return;
      }
      setShowCreateModal(false);
      setNewLabel("");
      setJustCreated({ fullKey: data.fullKey, label: data.key?.label || "مفتاح API" });
      await loadKeys();
    } catch {
      setCreateError("مشكلة في الاتصال — حاول تاني");
    } finally {
      setCreating(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/api-keys/${cancelTarget.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify("err", data.error || "فشل إلغاء المفتاح");
        return;
      }
      notify("ok", "تم إلغاء المفتاح ✓");
      setCancelTarget(null);
      await loadKeys();
    } catch {
      notify("err", "مشكلة في الاتصال — حاول تاني");
    } finally {
      setCancelling(false);
    }
  };

  // ——— شاشة التحقق من الجلسة ———
  if (!authChecked) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-bg">
        <Loader2 size={22} className="animate-spin text-green" />
        <p className="mono text-xs text-txt3">جاري التحقق من الجلسة…</p>
      </div>
    );
  }

  // ——— لازم تسجل دخول الأول ———
  if (!user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4">
        <div className="w-full max-w-sm rounded-lg border border-line bg-panel p-6 text-center animate-slideUp">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-cyan/40 bg-cyan/10">
            <KeyRound size={20} className="text-cyan" />
          </div>
          <h1 className="mb-1.5 text-[14px] font-bold text-txt">API للمطورين</h1>
          <p className="mb-4 text-[12px] leading-5 text-txt3">
            سجل دخول بحسابك الأول عشان تقدر تعمل مفاتيح API وتستخدم رصيدك.
          </p>
          <a
            href="/#"
            className="block w-full rounded-md bg-green/15 py-2.5 text-[12.5px] font-bold text-green transition-colors hover:bg-green/25"
          >
            رجوع لتسجيل الدخول
          </a>
        </div>
      </div>
    );
  }

  const remaining = quota ? Math.max(quota.total - quota.used, 0) : 0;

  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="safe-top sticky top-0 z-20 flex items-center justify-between border-b border-line bg-panel/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan/40 bg-cyan/10">
            <KeyRound size={16} className="text-cyan" />
          </div>
          <div>
            <h1 className="mono text-[13px] font-bold leading-tight text-txt">API للمطورين</h1>
            <p className="mono text-[10px] leading-tight text-txt3">mlag AI</p>
          </div>
        </div>
        <a
          href="/#"
          className="flex items-center gap-1 rounded-md border border-line2 px-3 py-1.5 text-[11.5px] text-txt2 transition-colors hover:text-txt"
        >
          <ChevronRight size={13} />
          رجوع للشات
        </a>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5">
        {/* بطاقة الرصيد */}
        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-cyan" />
              <h2 className="text-[13px] font-bold text-txt">رصيد الـ API</h2>
            </div>
            {quota && (
              <span
                className={`mono rounded px-2 py-0.5 text-[11px] font-bold ${
                  remaining <= 0 ? "bg-rose/15 text-rose" : "bg-green/15 text-green"
                }`}
              >
                متبقي: {formatTokens(remaining)}
              </span>
            )}
          </div>

          {loading && !quota ? (
            <p className="py-2 text-[12px] text-txt3">جاري التحميل…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-3">
              <div className="rounded-md border border-line bg-panel2 px-2 py-2">
                <p className="mono text-[13px] font-bold text-amber">{formatTokens(quota?.used ?? 0)}</p>
                <p className="text-[10px] text-txt3">مستهلك</p>
              </div>
              <div className="rounded-md border border-line bg-panel2 px-2 py-2">
                <p className="mono text-[13px] font-bold text-cyan">{formatTokens(quota?.total ?? 0)}</p>
                <p className="text-[10px] text-txt3">إجمالي الرصيد</p>
              </div>
              <div className="rounded-md border border-line bg-panel2 px-2 py-2 sm:block">
                <p className="mono text-[13px] font-bold text-green">{formatTokens(remaining)}</p>
                <p className="text-[10px] text-txt3">متبقي</p>
              </div>
            </div>
          )}

          {quota && quota.total === 0 && (
            <p className="mt-3 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11.5px] leading-5 text-amber">
              رصيد الـ API بتاعك صفر حاليًا — منفصل تمامًا عن رصيد الشات، ولازم تشحنه الأول عشان
              مفاتيحك تشتغل.
            </p>
          )}
        </section>

        {/* شحن رصيد API */}
        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Coins size={15} className="text-amber" />
            <h2 className="text-[13px] font-bold text-txt">شحن رصيد API</h2>
          </div>
          <p className="mb-3 text-[11.5px] leading-5 text-txt2">
            السعر:{" "}
            <span className="mono font-bold text-amber">{API_TOKEN_PRICE_PER_MILLION} جنيه</span> لكل
            مليون توكن. دوس على كمية عشان يفتحلك واتساب برسالة جاهزة، وهيتضاف رصيدك يدويًا فورًا بعد
            تأكيد الدفع.
          </p>
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {QUICK_AMOUNTS.map((tokens) => (
              <button
                key={tokens}
                onClick={() => openWhatsApp(tokens)}
                className="rounded-md border border-line2 bg-panel2 px-3 py-2.5 text-center transition-colors hover:border-amber/40"
              >
                <p className="mono text-[13px] font-bold text-cyan">{formatTokens(tokens)}</p>
                <p className="text-[10px] text-txt3">توكن</p>
                <p className="mono mt-1 text-[12px] font-bold text-amber">
                  {formatTokens(priceFor(tokens))} جنيه
                </p>
              </button>
            ))}
          </div>
          <button
            onClick={() => openWhatsApp(null)}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line2 py-2.5 text-[12px] text-txt2 transition-colors hover:border-cyan/40 hover:text-cyan"
          >
            <MessageCircle size={13} />
            كمية مخصصة؟ كلمنا واتساب
          </button>
        </section>

        {/* مفاتيح API */}
        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound size={15} className="text-green" />
              <h2 className="text-[13px] font-bold text-txt">مفاتيحك</h2>
            </div>
            <button
              onClick={() => {
                setCreateError(null);
                setNewLabel("");
                setNewModelId(AVAILABLE_MODELS[0].id);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 rounded-md bg-green/15 px-3 py-1.5 text-[11.5px] font-bold text-green transition-colors hover:bg-green/25"
            >
              <Plus size={13} />
              مفتاح جديد
            </button>
          </div>

          {loading ? (
            <p className="py-6 text-center text-[12px] text-txt3">جاري التحميل…</p>
          ) : error ? (
            <div className="py-6 text-center">
              <p className="mb-2 text-[12px] text-rose">{error}</p>
              <button onClick={loadKeys} className="text-[11.5px] font-bold text-green hover:underline">
                إعادة المحاولة
              </button>
            </div>
          ) : keys.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-txt3">لسه معملتش أي مفتاح API.</p>
          ) : (
            <div className="divide-y divide-line">
              {keys.map((k) => {
                const modelLabel = AVAILABLE_MODELS.find((m) => m.id === k.modelId)?.label ?? k.modelId;
                return (
                  <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[12.5px] font-bold text-txt">{k.label}</span>
                        {!k.isActive && (
                          <span className="rounded bg-rose/15 px-1.5 py-0.5 text-[9.5px] font-bold text-rose">
                            ملغى
                          </span>
                        )}
                        <span className="rounded bg-cyan/15 px-1.5 py-0.5 text-[9.5px] font-bold text-cyan">
                          {modelLabel}
                        </span>
                      </div>
                      <p className="mono text-[11px] text-txt3" dir="ltr">
                        {k.keyPrefix}********
                      </p>
                      <p className="mt-0.5 text-[10px] text-txt3">
                        اتعمل {formatDateTime(k.createdAt)} • آخر استخدام:{" "}
                        {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "لسه ماتستخدمش"}
                      </p>
                    </div>
                    {k.isActive && (
                      <button
                        onClick={() => setCancelTarget(k)}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-rose/30 px-2.5 py-1.5 text-[11px] text-rose transition-colors hover:bg-rose/10"
                      >
                        <Trash2 size={12} />
                        إلغاء
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* شرح الاستخدام */}
        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Terminal size={15} className="text-purple" />
            <h2 className="text-[13px] font-bold text-txt">إزاي تستخدمه في كودك</h2>
          </div>
          <pre
            className="mono overflow-x-auto rounded-md border border-line2 bg-panel2 p-3 text-[11px] leading-6 text-txt2"
            dir="ltr"
          >
{`POST ${origin || "https://<الدومين>"}/api/malg/v1/chat/completions
Authorization: Bearer <مفتاحك>
Content-Type: application/json

{ "messages": [{ "role": "user", "content": "أهلاً" }] }`}
          </pre>
          <p className="mt-2 text-[11px] leading-5 text-txt3">
            الموديل بيتحدد أوتوماتيك من المفتاح نفسه — مش لازم تبعته في الـ body، والرد بيرجع كامل
            (من غير streaming) في شكل قريب من صيغة OpenAI المعتادة.
          </p>
        </section>

        {/* جدول الأسعار */}
        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Coins size={15} className="text-amber" />
            <h2 className="text-[13px] font-bold text-txt">مرجع الأسعار</h2>
          </div>
          <table className="w-full text-[12px] text-txt2">
            <thead>
              <tr className="border-b border-line text-txt3">
                <th className="py-1.5 text-start font-normal">الكمية</th>
                <th className="py-1.5 text-start font-normal">السعر</th>
              </tr>
            </thead>
            <tbody>
              {QUICK_AMOUNTS.map((tokens) => (
                <tr key={tokens} className="border-b border-line/60 last:border-0">
                  <td className="mono py-1.5">{formatTokens(tokens)} توكن</td>
                  <td className="mono py-1.5 font-bold text-amber">{formatTokens(priceFor(tokens))} جنيه</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>

      {/* ——— مودال إنشاء مفتاح ——— */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm overflow-hidden rounded-lg border border-line2 bg-panel glow-green animate-slideUp">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <div className="flex items-center gap-2">
                <KeyRound size={15} className="text-green" />
                <h3 className="mono text-[12.5px] font-bold text-txt">مفتاح API جديد</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} className="text-txt3 hover:text-txt">
                <X size={15} />
              </button>
            </div>

            <div className="px-4 py-4">
              <label className="mb-1.5 block text-[11px] text-txt3">اسم المفتاح (اختياري)</label>
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="مثلاً: تطبيقي الأول"
                autoFocus
                className="mb-3 w-full rounded-md border border-line2 bg-panel2 px-2.5 py-2 text-[12.5px] text-txt focus:border-green/50 focus:outline-none"
              />

              <label className="mb-1.5 block text-[11px] text-txt3">
                الموديل — مش هينفع تغيّره بعد الإنشاء
              </label>
              <div className="mb-3 space-y-1.5">
                {AVAILABLE_MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setNewModelId(m.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-start transition-colors ${
                      newModelId === m.id ? "border-green/50 bg-green/10" : "border-line2 hover:border-line2"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="mono flex items-center gap-1.5 text-[12.5px] text-txt">
                        {m.label}
                        {m.id === "malg-2" && (
                          <span className="rounded bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan">
                            موصى به
                          </span>
                        )}
                      </span>
                      <span className="block text-[10px] text-txt3">{m.hint}</span>
                    </span>
                    {newModelId === m.id && <Check size={14} className="shrink-0 text-green" />}
                  </button>
                ))}
              </div>

              {createError && <p className="mb-2 text-[11.5px] text-rose">{createError}</p>}

              <button
                onClick={createKey}
                disabled={creating}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-green/15 py-2.5 text-[12.5px] font-bold text-green transition-colors hover:bg-green/25 disabled:opacity-50"
              >
                {creating && <Loader2 size={14} className="animate-spin" />}
                إنشاء المفتاح
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— عرض المفتاح الكامل مرة واحدة بس ——— */}
      {justCreated && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-amber/40 bg-panel animate-slideUp">
            <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
              <ShieldAlert size={15} className="text-amber" />
              <h3 className="mono text-[12.5px] font-bold text-txt">احفظ مفتاحك دلوقتي</h3>
            </div>
            <div className="px-4 py-4">
              <p className="mb-3 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11.5px] leading-5 text-amber">
                ده المفتاح الكامل بتاع «{justCreated.label}» — مش هيتعرض تاني بعد ما تقفل الشاشة دي.
                احفظه في مكان آمن دلوقتي.
              </p>
              <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-line2 bg-panel2 px-3 py-2.5">
                <span className="mono min-w-0 flex-1 truncate text-[11.5px] text-green" dir="ltr">
                  {justCreated.fullKey}
                </span>
                <button
                  onClick={() => copyFullKey(justCreated.fullKey)}
                  title="نسخ المفتاح"
                  className="shrink-0 text-txt3 hover:text-green"
                >
                  {copiedKey ? <Check size={14} className="text-green" /> : <Copy size={14} />}
                </button>
              </div>
              <button
                onClick={() => setJustCreated(null)}
                className="w-full rounded-md bg-green/15 py-2.5 text-[12.5px] font-bold text-green transition-colors hover:bg-green/25"
              >
                حفظته — إقفال
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— تأكيد إلغاء مفتاح ——— */}
      {cancelTarget && (
        <ConfirmModal
          title="إلغاء مفتاح API"
          message={`هيتم إلغاء مفتاح «${cancelTarget.label}» نهائيًا — أي كود بيستخدمه هيبطل يشتغل على طول. الاستخدام القديم هيفضل متسجل في السجل.`}
          confirmLabel={cancelling ? "جاري الإلغاء…" : "تأكيد الإلغاء"}
          danger
          onConfirm={confirmCancel}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {/* ——— إشعار عائم ——— */}
      {notice && (
        <div className="fixed bottom-6 left-1/2 z-[70] w-[92%] max-w-sm -translate-x-1/2 animate-slideUp">
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2.5 shadow-lg backdrop-blur ${
              notice.type === "ok" ? "border-green/40 bg-panel/95 glow-green" : "border-rose/50 bg-panel/95"
            }`}
          >
            {notice.type === "ok" ? (
              <CheckCircle2 size={16} className="shrink-0 text-green" />
            ) : (
              <XCircle size={16} className="shrink-0 text-rose" />
            )}
            <p className="flex-1 text-xs leading-5 text-txt">{notice.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
