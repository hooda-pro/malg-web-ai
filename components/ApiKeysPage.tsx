"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Info,
  KeyRound,
  Loader2,
  MessageCircle,
  Plus,
  ShieldAlert,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { formatTokens } from "@/lib/ai";
import {
  API_TOKEN_PRICE_PER_MILLION,
  buildApiRechargeMessage,
  buildWhatsAppLink,
} from "@/lib/recharge";
import { Button, Dialog, Field, IconButton, Panel } from "./ui/Controls";
import { ThemeSwitch } from "./AccountMenu";
import Toast from "./Toast";
import { useSettings } from "./SettingsContext";
import { formatDateTime, timeAgo } from "./admin/helpers";
import { cn } from "@/lib/utils";

type ModelId = "malg-a3";

const API_MODELS: { id: ModelId; hint: string; recommended?: boolean }[] = [
  { id: "malg-a3", hint: "الموديل الموحّد — بيدمج كل المزوّدين الداخليين في نموذج واحد", recommended: true },
];

interface ApiKeyRow {
  id: string;
  label: string;
  keyPrefix: string;
  modelId: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const QUICK_AMOUNTS = [1_000_000, 5_000_000, 10_000_000];

type SnippetId = "curl" | "python" | "js" | "cline" | "opencode" | "codex" | "claude";

const SNIPPET_TABS: { id: SnippetId; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python" },
  { id: "js", label: "JavaScript" },
  { id: "cline", label: "Cline" },
  { id: "opencode", label: "OpenCode" },
  { id: "codex", label: "Codex CLI" },
  { id: "claude", label: "Claude Code" },
];

function priceFor(tokens: number): number {
  return Math.round((tokens / 1_000_000) * API_TOKEN_PRICE_PER_MILLION);
}

function buildSnippet(id: SnippetId, base: string): { code: string; note?: ReactNode; warn?: boolean } {
  const url = `${base}/api/malg/v1`;
  switch (id) {
    case "curl":
      return {
        code: `curl ${url}/chat/completions \\
  -H "Authorization: Bearer $MLAG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{ "role": "user", "content": "أهلاً" }],
    "stream": false
  }'`,
        note: "الموديل بيتحدد تلقائيًا من المفتاح — مش لازم تبعته. ضيف \"stream\": true عشان تستقبل الرد كـ SSE بصيغة OpenAI.",
      };
    case "python":
      return {
        code: `from openai import OpenAI

client = OpenAI(
    base_url="${url}",
    api_key="MLAG_API_KEY",
)

res = client.chat.completions.create(
    model="malg-a3",
    messages=[{"role": "user", "content": "أهلاً"}],
)
print(res.choices[0].message.content)`,
        note: "أي SDK متوافق مع OpenAI بيشتغل — غيّر base_url بس.",
      };
    case "js":
      return {
        code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${url}",
  apiKey: process.env.MLAG_API_KEY,
});

const res = await client.chat.completions.create({
  model: "malg-a3",
  messages: [{ role: "user", content: "أهلاً" }],
});
console.log(res.choices[0].message.content);`,
      };
    case "cline":
      return {
        code: `API Provider   OpenAI Compatible
Base URL       ${url}
API Key        <مفتاحك>
Model ID       malg-a3`,
        note: "من إعدادات Cline في VS Code أو JetBrains. اسم الـ Model ID شكلي بس — الموديل محدد من المفتاح.",
      };
    case "opencode":
      return {
        code: `{
  "provider": {
    "mlag": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "mlag AI",
      "options": { "baseURL": "${url}" },
      "models": { "malg-a3": {} }
    }
  }
}`,
        note: "حطه في opencode.json، وبعدين opencode auth login ← Other ← اكتب mlag ← الصق مفتاحك، واختار mlag/malg-a3 من /models.",
      };
    case "codex":
      return {
        code: `# ~/.codex/config.toml
model = "malg-a3"
model_provider = "mlag"

[model_providers.mlag]
name = "mlag AI"
base_url = "${url}"
env_key = "MLAG_API_KEY"
wire_api = "chat"`,
        note: "بعض إصدارات Codex الحديثة بتدعم wire_api = \"responses\" بس. لو ظهرلك خطأ برفض \"chat\" جرّب Cline أو OpenCode.",
        warn: true,
      };
    case "claude":
      return {
        code: `# Claude Code بيتكلم بروتوكول Anthropic (Messages API) بس
# محتاج جسر ترجمة محلي زي LiteLLM:
export ANTHROPIC_BASE_URL="http://localhost:4000"
# وLiteLLM نفسه يوجّه على:
#   ${url}`,
        note: "مفيش ربط مباشر — Cline أو OpenCode أسهل بكتير مع mlag.",
        warn: true,
      };
  }
}

/** لوحة الـ API للمطورين: رصيد منفصل، مفاتيح، أمثلة ربط، وشحن. */
export default function ApiKeysPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [quota, setQuota] = useState<{ total: number; used: number } | null>(null);

  const [origin, setOrigin] = useState("");
  const [snippet, setSnippet] = useState<SnippetId>("curl");
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [amount, setAmount] = useState<number>(QUICK_AMOUNTS[0]);

  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newModelId, setNewModelId] = useState<ModelId>("malg-a3");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [justCreated, setJustCreated] = useState<{ fullKey: string; label: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const notify = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((n) => (n === text ? null : n)), 4000);
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
      } catch {
        setUser(null);
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
      if (data.quota) setQuota({ total: data.quota.totalAllocatedTokens, used: data.quota.usedTokens });
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

  const base = origin || "https://your-domain";
  const snip = useMemo(() => buildSnippet(snippet, base), [snippet, base]);

  const openWhatsApp = (tokens: number | null) => {
    const url = buildWhatsAppLink(buildApiRechargeMessage(tokens, user));
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copy = async (text: string, done: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      done(true);
      window.setTimeout(() => done(false), 1500);
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
      setShowCreate(false);
      setNewLabel("");
      setJustCreated({ fullKey: data.fullKey, label: data.key?.label || "مفتاح API" });
      await loadKeys();
    } catch {
      setCreateError("مشكلة في الاتصال — حاول تاني");
    } finally {
      setCreating(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const res = await fetch(`/api/api-keys/${revokeTarget.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify(data.error || "فشل إلغاء المفتاح");
        return;
      }
      notify("تم إلغاء المفتاح");
      setRevokeTarget(null);
      await loadKeys();
    } catch {
      notify("مشكلة في الاتصال — حاول تاني");
    } finally {
      setRevoking(false);
    }
  };

  const openCreate = () => {
    setCreateError(null);
    setNewLabel("");
    setNewModelId("malg-a3");
    setShowCreate(true);
  };

  if (!authChecked) {
    return (
      <div dir="rtl" lang="ar" className="flex min-h-[100dvh] items-center justify-center bg-ground">
        <Loader2 size={20} className="animate-spin-slow text-ink-3" aria-label="جاري التحميل" />
      </div>
    );
  }

  if (!user) {
    return (
      <div dir="rtl" lang="ar" className="flex min-h-[100dvh] items-center justify-center bg-ground px-4">
        <div className="animate-materialize w-full max-w-sm rounded-2xl border border-hair bg-surface p-8 text-center shadow-2">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-ink shadow-accent">
            <KeyRound size={20} />
          </span>
          <h1 className="mt-5 text-balance text-[20px] font-semibold tracking-title text-ink">API للمطورين</h1>
          <p className="mt-2 text-pretty text-[13.5px] leading-6 text-ink-2">
            سجّل دخول بحسابك الأول عشان تعمل مفاتيح API وتستخدم رصيدك في تطبيقاتك.
          </p>
          <a
            href="/#"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-accent text-[14px] font-medium text-accent-ink shadow-accent transition-colors hover:bg-accent-hover"
          >
            تسجيل الدخول
          </a>
        </div>
      </div>
    );
  }

  const remaining = quota ? Math.max(quota.total - quota.used, 0) : 0;
  const pct = quota && quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0;
  const activeKeys = keys.filter((k) => k.isActive).length;

  return (
    <div dir="rtl" lang="ar" className="h-[100dvh] overflow-y-auto bg-ground">
      <header className="glass sticky top-0 z-nav border-b border-hair">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <a
            href="/#"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <ArrowLeft size={15} className="rotate-180" />
            الشات
          </a>
          <span className="h-4 w-px bg-hair-2" aria-hidden="true" />
          <span className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-accent text-accent-ink shadow-accent">
              <Sparkles size={14} />
            </span>
            <span className="text-[14.5px] font-semibold tracking-title text-ink">mlag</span>
            <span className="rounded-full border border-hair px-2 py-0.5 font-mono text-[11px] text-ink-3" dir="ltr">
              API
            </span>
          </span>
          <div className="ms-auto">
            <ThemeSwitchStandalone />
          </div>
        </div>
      </header>

      <main id="mlag-main" className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-20 pt-10 sm:px-6">
        <section className="stagger flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-xl">
            <h1 className="text-balance text-[clamp(26px,4.4vw,34px)] font-semibold leading-tight tracking-display text-ink">
              API للمطورين
            </h1>
            <p className="mt-2 text-pretty text-[15px] leading-7 text-ink-2">
              استخدم mlag جوه تطبيقاتك وأدواتك بواجهة متوافقة مع OpenAI. رصيد الـ API منفصل تمامًا عن رصيد الشات.
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus size={16} />
            مفتاح جديد
          </Button>
        </section>

        <Panel className="grid grid-cols-1 sm:grid-cols-3">
          <div className="border-b border-hair p-5 sm:border-b-0 sm:border-e">
            <p className="text-[12.5px] text-ink-3">الرصيد المتبقي</p>
            <p className="tnum mt-1.5 text-[28px] font-semibold leading-none tracking-display text-ink">
              {loading && !quota ? "—" : formatTokens(remaining)}
            </p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn("h-full rounded-full", pct >= 90 ? "bg-danger" : "bg-accent")}
                style={{ width: `${Math.max(pct, quota && quota.total > 0 ? 1.5 : 0)}%` }}
              />
            </div>
          </div>
          <div className="border-b border-hair p-5 sm:border-b-0 sm:border-e">
            <p className="text-[12.5px] text-ink-3">المستهلك</p>
            <p className="tnum mt-1.5 text-[28px] font-semibold leading-none tracking-display text-ink">
              {formatTokens(quota?.used ?? 0)}
            </p>
            <p className="tnum mt-3 text-[12.5px] text-ink-3">من إجمالي {formatTokens(quota?.total ?? 0)}</p>
          </div>
          <div className="p-5">
            <p className="text-[12.5px] text-ink-3">المفاتيح النشطة</p>
            <p className="tnum mt-1.5 text-[28px] font-semibold leading-none tracking-display text-ink">
              {activeKeys}
            </p>
            <p className="mt-3 text-[12.5px] text-ink-3">الحد الأقصى 20 مفتاح</p>
          </div>
        </Panel>

        {quota && quota.total === 0 && (
          <div className="-mt-6 flex items-start gap-3 rounded-lg border border-hair bg-surface px-4 py-3.5 shadow-1">
            <Info size={16} className="mt-1 shrink-0 text-warn" />
            <p className="text-pretty text-[13.5px] leading-6 text-ink-2">
              رصيد الـ API بتاعك صفر حاليًا — اشحن من قسم الشحن تحت عشان مفاتيحك تشتغل.
            </p>
          </div>
        )}

        <section aria-labelledby="keys-title">
          <SectionHead id="keys-title" title="المفاتيح" hint="المفتاح الكامل بيظهر مرة واحدة بس وقت الإنشاء." />
          <Panel>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-ink-3">
                <Loader2 size={15} className="animate-spin-slow" />
                جاري التحميل…
              </div>
            ) : error ? (
              <div className="py-12 text-center">
                <p className="text-[13.5px] text-danger">{error}</p>
                <Button size="sm" className="mt-3" onClick={loadKeys}>
                  إعادة المحاولة
                </Button>
              </div>
            ) : keys.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-3 text-ink-3">
                  <KeyRound size={18} />
                </span>
                <p className="mt-4 text-[15px] font-medium text-ink">لسه معندكش مفاتيح</p>
                <p className="mt-1 text-[13px] text-ink-3">اعمل أول مفتاح وابدأ تكلّم mlag من كودك.</p>
                <Button variant="primary" size="sm" className="mt-5" onClick={openCreate}>
                  <Plus size={14} />
                  إنشاء مفتاح
                </Button>
              </div>
            ) : (
              <ul>
                {keys.map((k) => (
                  <li
                    key={k.id}
                    className={cn(
                      "flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hair px-4 py-3.5 first:border-t-0 sm:px-5",
                      !k.isActive && "opacity-60"
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-md",
                        k.isActive ? "bg-accent-soft text-accent" : "bg-surface-3 text-ink-3"
                      )}
                    >
                      <KeyRound size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-ink">{k.label}</span>
                        <span className="rounded-full border border-hair px-2 py-px font-mono text-[11px] text-ink-2" dir="ltr">
                          {k.modelId}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11.5px] font-medium",
                            k.isActive ? "text-live" : "text-ink-3"
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", k.isActive ? "bg-live" : "bg-ink-3")} />
                          {k.isActive ? "نشط" : "ملغى"}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[12px] text-ink-3" dir="ltr">
                        {k.keyPrefix}••••••••••••
                      </p>
                    </div>
                    <div className="text-[12px] leading-5 text-ink-3 sm:text-end">
                      <p>اتعمل {formatDateTime(k.createdAt)}</p>
                      <p>آخر استخدام: {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "لسه"}</p>
                    </div>
                    {k.isActive && (
                      <IconButton
                        label={`إلغاء ${k.label}`}
                        onClick={() => setRevokeTarget(k)}
                        size="sm"
                        className="hover:!bg-danger-soft hover:!text-danger"
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </section>

        <section aria-labelledby="quick-title">
          <SectionHead id="quick-title" title="البدء السريع" hint="بيانات الربط بتاعتك جاهزة في الأمثلة." />
          <Panel>
            <div className="flex gap-1 overflow-x-auto border-b border-hair p-2" role="tablist" dir="ltr">
              {SNIPPET_TABS.map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={snippet === tab.id}
                  onClick={() => setSnippet(tab.id)}
                  className={cn(
                    "h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-1",
                    snippet === tab.id ? "bg-surface-3 text-ink" : "text-ink-3 hover:text-ink"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="code-surface relative" dir="ltr">
              <button
                onClick={() => copy(snip.code, setSnippetCopied)}
                className="absolute end-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-2.5 py-1 text-[12px] font-medium text-ink-2 shadow-1 transition-colors hover:text-ink"
              >
                {snippetCopied ? <Check size={12} className="text-live" /> : <Copy size={12} />}
                {snippetCopied ? "Copied" : "Copy"}
              </button>
              <pre className="overflow-x-auto px-5 py-4 pe-24 font-mono text-[12.5px] leading-[1.75] text-ink">
                <code>{snip.code}</code>
              </pre>
            </div>
            {snip.note && (
              <p
                className={cn(
                  "flex items-start gap-2.5 border-t border-hair px-5 py-3.5 text-pretty text-[13px] leading-6",
                  snip.warn ? "text-warn" : "text-ink-2"
                )}
              >
                <Info size={14} className="mt-1 shrink-0" />
                {snip.note}
              </p>
            )}
          </Panel>
          <p className="mt-3 px-1 text-pretty text-[12.5px] leading-6 text-ink-3">
            حتى جوه أدوات زي Cline، الموديل بيعرّف نفسه كـ mlag — الهوية دي مفروضة على مستوى الـ API ومش بتأثر على أداء المهمة.
          </p>
        </section>

        <section aria-labelledby="topup-title">
          <SectionHead
            id="topup-title"
            title="شحن رصيد الـ API"
            hint={`${API_TOKEN_PRICE_PER_MILLION} جنيه لكل مليون توكن — بيتضاف يدويًا بعد تأكيد الدفع.`}
          />
          <div role="radiogroup" aria-label="كمية الشحن" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {QUICK_AMOUNTS.map((tokens) => {
              const active = amount === tokens;
              return (
                <button
                  key={tokens}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAmount(tokens)}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border bg-surface p-4 text-start shadow-1 transition-all duration-2 ease-soft",
                    active ? "border-accent shadow-[0_0_0_3.5px_var(--accent-soft)]" : "border-hair hover:border-hair-2"
                  )}
                >
                  <span>
                    <span className="flex items-center gap-1.5">
                      <Zap size={13} className="text-accent" />
                      <span className="tnum text-[20px] font-semibold tracking-title text-ink">
                        {formatTokens(tokens)}
                      </span>
                    </span>
                    <span className="tnum mt-1 block text-[13px] text-ink-2">{formatTokens(priceFor(tokens))} جنيه</span>
                  </span>
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                      active ? "border-accent bg-accent text-accent-ink" : "border-hair-2"
                    )}
                    aria-hidden="true"
                  >
                    {active && <Check size={12} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => openWhatsApp(null)}
              className="text-[13px] font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent"
            >
              محتاج كمية مخصصة؟ كلّمنا
            </button>
            <Button variant="primary" onClick={() => openWhatsApp(amount)}>
              <MessageCircle size={15} />
              {`اشحن ${formatTokens(amount)} عبر واتساب`}
            </Button>
          </div>
        </section>
      </main>

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        labelledBy="create-key-title"
        title="مفتاح API جديد"
        subtitle="الموديل بيتثبت على المفتاح ومش هينفع يتغير بعد الإنشاء."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={createKey} disabled={creating}>
              {creating && <Loader2 size={14} className="animate-spin-slow" />}
              إنشاء المفتاح
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pb-4">
          <Field
            label="اسم المفتاح (اختياري)"
            value={newLabel}
            maxLength={60}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="مثلاً: تطبيقي الأول"
          />
          <fieldset>
            <legend className="mb-1.5 block text-[12.5px] font-medium tracking-label text-ink-2">الموديل</legend>
            <Panel>
              {API_MODELS.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-3 border-t border-hair px-4 py-3 transition-colors first:border-t-0 hover:bg-surface-3"
                >
                  <input
                    type="radio"
                    name="api-model"
                    value={m.id}
                    checked={newModelId === m.id}
                    onChange={() => setNewModelId(m.id)}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[13px] text-ink" dir="ltr">
                        {m.id}
                      </span>
                      {m.recommended && (
                        <span className="rounded-full bg-accent-soft px-2 py-px text-[10.5px] font-medium text-accent">
                          موصى به
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">{m.hint}</span>
                  </span>
                </label>
              ))}
            </Panel>
          </fieldset>
          {createError && (
            <p role="alert" className="text-[13px] text-danger">
              {createError}
            </p>
          )}
        </div>
      </Dialog>

      <Dialog
        open={!!justCreated}
        onClose={() => setJustCreated(null)}
        labelledBy="created-key-title"
        title="احفظ مفتاحك دلوقتي"
        footer={
          <Button variant="primary" className="w-full" onClick={() => setJustCreated(null)}>
            حفظته
          </Button>
        }
      >
        {justCreated && (
          <div className="flex flex-col gap-4 pb-4">
            <p className="flex items-start gap-2.5 rounded-md border border-hair bg-surface-2 px-3.5 py-3 text-pretty text-[13px] leading-6 text-ink-2">
              <ShieldAlert size={16} className="mt-1 shrink-0 text-warn" />
              {`ده المفتاح الكامل لـ «${justCreated.label}» — مش هيظهر تاني بعد ما تقفل. احفظه في مكان آمن ومتشاركوش.`}
            </p>
            <div className="flex items-center gap-2 rounded-md border border-hair bg-surface-inset p-1.5 ps-3.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink" dir="ltr">
                {justCreated.fullKey}
              </code>
              <Button size="sm" onClick={() => copy(justCreated.fullKey, setCopiedKey)}>
                {copiedKey ? <Check size={13} className="text-live" /> : <Copy size={13} />}
                {copiedKey ? "اتنسخ" : "نسخ"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        labelledBy="revoke-key-title"
        title="إلغاء المفتاح؟"
        subtitle={
          revokeTarget
            ? `أي كود بيستخدم «${revokeTarget.label}» هيبطل يشتغل فورًا. سجل الاستخدام القديم هيفضل موجود.`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              رجوع
            </Button>
            <Button variant="danger" onClick={confirmRevoke} disabled={revoking}>
              {revoking && <Loader2 size={14} className="animate-spin-slow" />}
              إلغاء المفتاح
            </Button>
          </div>
        }
      >
        <div className="pb-2" />
      </Dialog>

      {notice && <Toast message={notice} onClose={() => setNotice(null)} />}
    </div>
  );
}

function SectionHead({ id, title, hint }: { id: string; title: string; hint?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
      <h2 id={id} className="text-[17px] font-semibold tracking-title text-ink">
        {title}
      </h2>
      {hint && <p className="text-pretty text-[12.5px] text-ink-3">{hint}</p>}
    </div>
  );
}

function ThemeSwitchStandalone() {
  const { theme, setTheme } = useSettings();
  return <ThemeSwitch value={theme} onChange={setTheme} />;
}
