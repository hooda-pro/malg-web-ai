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
import Logo from "./Logo";
import { useSettings } from "./SettingsContext";
import { formatDateTime, timeAgo } from "./admin/helpers";
import { cn } from "@/lib/utils";

type ModelId = string;

interface ApiModelOption {
  id: string;
  name: string;
  hint: string;
  recommended?: boolean;
}

const FALLBACK_API_MODELS: ApiModelOption[] = [
  { id: "malg-ai", name: "MALG AI", hint: "", recommended: true },
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

type TFn = (key: string, params?: Record<string, string | number>) => string;

function buildSnippet(id: SnippetId, base: string, t: TFn): { code: string; note?: ReactNode; warn?: boolean } {
  const url = `${base}/api/malg/v1`;
  switch (id) {
    case "curl":
      return {
        code: `curl ${url}/chat/completions \\
  -H "Authorization: Bearer $MALG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "messages": [{ "role": "user", "content": "${t("akSampleGreeting")}" }],
    "stream": false
  }'`,
        note: t("akNoteCurl"),
      };
    case "python":
      return {
        code: `from openai import OpenAI

client = OpenAI(
    base_url="${url}",
    api_key="MALG_API_KEY",
)

res = client.chat.completions.create(
    model="malg-ai",
    messages=[{"role": "user", "content": "${t("akSampleGreeting")}"}],
)
print(res.choices[0].message.content)`,
        note: t("akNotePython"),
      };
    case "js":
      return {
        code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${url}",
  apiKey: process.env.MALG_API_KEY,
});

const res = await client.chat.completions.create({
  model: "malg-ai",
  messages: [{ role: "user", content: "${t("akSampleGreeting")}" }],
});
console.log(res.choices[0].message.content);`,
      };
    case "cline":
      return {
        code: `API Provider   OpenAI Compatible
Base URL       ${url}
API Key        ${t("akClineKeyPlaceholder")}
Model ID       malg-ai`,
        note: t("akNoteCline"),
      };
    case "opencode":
      return {
        code: `{
  "provider": {
    "MALG": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "MALG AI",
      "options": { "baseURL": "${url}" },
      "models": { "malg-ai": {} }
    }
  }
}`,
        note: t("akNoteOpencode"),
      };
    case "codex":
      return {
        code: `# ~/.codex/config.toml
model = "malg-ai"
model_provider = "MALG"

[model_providers.MALG]
name = "MALG AI"
base_url = "${url}"
env_key = "MALG_API_KEY"
wire_api = "chat"`,
        note: t("akNoteCodex"),
        warn: true,
      };
    case "claude":
      return {
        code: `# ${t("akClaudeCode1")}
# ${t("akClaudeCode2")}
export ANTHROPIC_BASE_URL="http://localhost:4000"
# ${t("akClaudeRedirect")}
#   ${url}`,
        note: t("akNoteClaude"),
        warn: true,
      };
  }
}

/** لوحة الـ API للمطورين: رصيد منفصل، مفاتيح، أمثلة ربط، وشحن. */
export default function ApiKeysPage() {
  const { t, lang } = useSettings();
  const dirAttr = lang === "ar" ? "rtl" : "ltr";
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

  const [apiModels, setApiModels] = useState<ApiModelOption[]>(FALLBACK_API_MODELS);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newModelId, setNewModelId] = useState<ModelId>("malg-ai");
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
    // موديلات API المتاحة من السيرفر (اللي الأدمن ضافها) — مع fallback محلي
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((data) => {
        const list = Array.isArray(data?.models) ? data.models : [];
        if (list.length === 0) return;
        const mapped: ApiModelOption[] = list.map(
          (m: { id: string; name?: string; description?: string; isDefault?: boolean }) => ({
            id: String(m.id),
            name: String(m.name || m.id),
            hint: typeof m.description === "string" && m.description ? m.description : "",
            recommended: !!m.isDefault,
          })
        );
        setApiModels(mapped);
        setNewModelId((prev) => (mapped.some((m) => m.id === prev) ? prev : (mapped.find((m) => m.recommended)?.id ?? mapped[0].id)));
      })
      .catch(() => {});
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
      if (!res.ok) throw new Error(data.error || t("akLoadError"));
      setKeys(data.keys || []);
      if (data.quota) setQuota({ total: data.quota.totalAllocatedTokens, used: data.quota.usedTokens });
    } catch (e) {
      setError(e instanceof Error ? e.message : t("akLoadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadKeys();
  }, [authChecked, user, loadKeys]);

  const base = origin || "https://your-domain";
  const snip = useMemo(() => buildSnippet(snippet, base, t), [snippet, base, t]);

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
        setCreateError(data.error || t("akCreateFail"));
        return;
      }
      setShowCreate(false);
      setNewLabel("");
      setJustCreated({ fullKey: data.fullKey, label: data.key?.label || t("akDefaultLabel") });
      await loadKeys();
    } catch {
      setCreateError(t("akConnError"));
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
        notify(data.error || t("akRevokeFail"));
        return;
      }
      notify(t("akRevokedNotice"));
      setRevokeTarget(null);
      await loadKeys();
    } catch {
      notify(t("akConnError"));
    } finally {
      setRevoking(false);
    }
  };

  const openCreate = () => {
    setCreateError(null);
    setNewLabel("");
    const def = apiModels.find((m) => m.recommended) ?? apiModels[0];
    if (def && !apiModels.some((m) => m.id === newModelId)) setNewModelId(def.id);
    setShowCreate(true);
  };

  if (!authChecked) {
    return (
      <div dir={dirAttr} lang={lang} className="bg-ground" role="status" aria-live="polite" aria-label={t("akLoadingAria")}>
        <div className="mx-auto w-full max-w-2xl space-y-3 px-5 py-8" aria-hidden="true">
          <div className="skel h-8 w-48 rounded-lg" />
          <div className="skel h-4 w-72 rounded-full" />
          <div className="skel mt-4 h-24 rounded-2xl" />
          <div className="skel h-24 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div dir={dirAttr} lang={lang} className="flex min-h-[100dvh] items-center justify-center bg-ground px-4">
        <div className="animate-materialize w-full max-w-sm rounded-2xl border border-hair bg-surface p-8 text-center shadow-2">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-ink shadow-accent">
            <KeyRound size={20} />
          </span>
          <h1 className="mt-5 text-balance text-[20px] font-semibold tracking-title text-ink">{t("akTitle")}</h1>
          <p className="mt-2 text-pretty text-[13.5px] leading-6 text-ink-2">
            {t("akSignInBody")}
          </p>
          <a
            href="/#"
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-full bg-accent text-[14px] font-medium text-accent-ink shadow-accent transition-colors hover:bg-accent-hover"
          >
            {t("akSignInBtn")}
          </a>
        </div>
      </div>
    );
  }

  const remaining = quota ? Math.max(quota.total - quota.used, 0) : 0;
  const pct = quota && quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0;
  const activeKeys = keys.filter((k) => k.isActive).length;

  return (
    <div dir={dirAttr} lang={lang} className="h-[100dvh] overflow-y-auto bg-ground">
      <header className="glass sticky top-0 z-nav border-b border-hair">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <a
            href="/#"
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <ArrowLeft size={15} className="rotate-180" />
            {t("akBackChat")}
          </a>
          <span className="h-4 w-px bg-hair-2" aria-hidden="true" />
          <span className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-accent text-accent-ink shadow-accent">
              <Logo size={17} />
            </span>
            <span className="text-[14.5px] font-semibold tracking-title text-ink">MALG</span>
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
              {t("akTitle")}
            </h1>
            <p className="mt-2 text-pretty text-[15px] leading-7 text-ink-2">
              {t("akSubtitle")}
            </p>
          </div>
          <Button variant="primary" onClick={openCreate}>
            <Plus size={16} />
            {t("akNewKey")}
          </Button>
        </section>

        <div className="animate-rise -mt-5 flex items-start gap-3 rounded-lg border border-accent-line bg-accent-soft px-4 py-3.5">
          <Info size={16} className="mt-1 shrink-0 text-accent" />
          <div className="text-pretty text-[13.5px] leading-6 text-ink">
            <p className="font-semibold">{t("akNoticeTitle")}</p>
            <p className="mt-1 text-ink-2">
              {t("akNoticeBody")}
            </p>
          </div>
        </div>

        <Panel className="grid grid-cols-1 sm:grid-cols-3">
          <div className="border-b border-hair p-5 sm:border-b-0 sm:border-e">
            <p className="text-[12.5px] text-ink-3">{t("akBalanceRemaining")}</p>
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
            <p className="text-[12.5px] text-ink-3">{t("akUsed")}</p>
            <p className="tnum mt-1.5 text-[28px] font-semibold leading-none tracking-display text-ink">
              {formatTokens(quota?.used ?? 0)}
            </p>
            <p className="tnum mt-3 text-[12.5px] text-ink-3">{t("akOfTotal", { total: formatTokens(quota?.total ?? 0) })}</p>
          </div>
          <div className="p-5">
            <p className="text-[12.5px] text-ink-3">{t("akActiveKeys")}</p>
            <p className="tnum mt-1.5 text-[28px] font-semibold leading-none tracking-display text-ink">
              {activeKeys}
            </p>
            <p className="mt-3 text-[12.5px] text-ink-3">{t("akKeysMax")}</p>
          </div>
        </Panel>

        {quota && quota.total === 0 && (
          <div className="-mt-6 flex items-start gap-3 rounded-lg border border-hair bg-surface px-4 py-3.5 shadow-1">
            <Info size={16} className="mt-1 shrink-0 text-warn" />
            <p className="text-pretty text-[13.5px] leading-6 text-ink-2">
              {t("akZeroBalance")}
            </p>
          </div>
        )}

        <section aria-labelledby="keys-title">
          <SectionHead id="keys-title" title={t("akKeysTitle")} hint={t("akKeysHint")} />
          <Panel>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-ink-3">
                <Loader2 size={15} className="animate-spin-slow" />
                {t("akLoading")}
              </div>
            ) : error ? (
              <div className="py-12 text-center">
                <p className="text-[13.5px] text-danger">{error}</p>
                <Button size="sm" className="mt-3" onClick={loadKeys}>
                  {t("akRetry")}
                </Button>
              </div>
            ) : keys.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-3 text-ink-3">
                  <KeyRound size={18} />
                </span>
                <p className="mt-4 text-[15px] font-medium text-ink">{t("akNoKeys")}</p>
                <p className="mt-1 text-[13px] text-ink-3">{t("akNoKeysHint")}</p>
                <Button variant="primary" size="sm" className="mt-5" onClick={openCreate}>
                  <Plus size={14} />
                  {t("akCreateKey")}
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
                        <span className="rounded-full border border-hair px-2 py-px text-[11px] text-ink-2" title={k.modelId}>
                          {apiModels.find((m) => m.id === k.modelId)?.name ?? k.modelId}
                        </span>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-[11.5px] font-medium",
                            k.isActive ? "text-live" : "text-ink-3"
                          )}
                        >
                          <span className={cn("h-1.5 w-1.5 rounded-full", k.isActive ? "bg-live" : "bg-ink-3")} />
                          {k.isActive ? t("akActive") : t("akRevoked")}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[12px] text-ink-3" dir="ltr">
                        {k.keyPrefix}••••••••••••
                      </p>
                    </div>
                    <div className="text-[12px] leading-5 text-ink-3 sm:text-end">
                      <p>{t("akCreatedAt", { date: formatDateTime(k.createdAt, lang) })}</p>
                      <p>{t("akLastUsed", { value: k.lastUsedAt ? timeAgo(k.lastUsedAt, lang) : t("akNeverUsed") })}</p>
                    </div>
                    {k.isActive && (
                      <IconButton
                        label={t("akRevokeLabel", { label: k.label })}
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
          <SectionHead id="quick-title" title={t("akQuickTitle")} hint={t("akQuickHint")} />
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
            {t("akEvenInTools")}
          </p>
        </section>

        <section aria-labelledby="topup-title">
          <SectionHead
            id="topup-title"
            title={t("akTopupTitle")}
            hint={t("akTopupHint", { price: API_TOKEN_PRICE_PER_MILLION })}
          />
          <div role="radiogroup" aria-label={t("akAmountAria")} className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
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
                    <span className="tnum mt-1 block text-[13px] text-ink-2">{formatTokens(priceFor(tokens))} {t("akCurrency")}</span>
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
              {t("akCustomQty")}
            </button>
            <Button variant="primary" onClick={() => openWhatsApp(amount)}>
              <MessageCircle size={15} />
              {t("akRechargeWatsapp", { amount: formatTokens(amount) })}
            </Button>
          </div>
        </section>
      </main>

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        labelledBy="create-key-title"
        title={t("akCreateTitle")}
        subtitle={t("akCreateSubtitle")}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              {t("akCancel")}
            </Button>
            <Button variant="primary" onClick={createKey} disabled={creating}>
              {creating && <Loader2 size={14} className="animate-spin-slow" />}
              {t("akCreateBtn")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pb-4">
          <Field
            label={t("akLabelField")}
            value={newLabel}
            maxLength={60}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder={t("akLabelPlaceholder")}
          />
          <fieldset>
            <legend className="mb-1.5 block text-[12.5px] font-medium tracking-label text-ink-2">{t("akModelLegend")}</legend>
            <Panel>
              {apiModels.map((m) => (
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
                      <span className="truncate text-[13.5px] font-medium text-ink">
                        {m.name}
                      </span>
                      {m.recommended && (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-px text-[10.5px] font-medium text-accent">
                          {t("akRecommended")}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-ink-3">
                      <span className="font-mono" dir="ltr">{m.id}</span>
                      {m.hint ? ` · ${m.hint}` : m.id === "malg-ai" ? ` · ${t("akFallbackModelHint")}` : ""}
                    </span>
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
        title={t("akCreatedTitle")}
        footer={
          <Button variant="primary" className="w-full" onClick={() => setJustCreated(null)}>
            {t("akCreatedBtn")}
          </Button>
        }
      >
        {justCreated && (
          <div className="flex flex-col gap-4 pb-4">
            <p className="flex items-start gap-2.5 rounded-md border border-hair bg-surface-2 px-3.5 py-3 text-pretty text-[13px] leading-6 text-ink-2">
              <ShieldAlert size={16} className="mt-1 shrink-0 text-warn" />
              {t("akCreatedBody", { label: justCreated.label })}
            </p>
            <div className="flex items-center gap-2 rounded-md border border-hair bg-surface-inset p-1.5 ps-3.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink" dir="ltr">
                {justCreated.fullKey}
              </code>
              <Button size="sm" onClick={() => copy(justCreated.fullKey, setCopiedKey)}>
                {copiedKey ? <Check size={13} className="text-live" /> : <Copy size={13} />}
                {copiedKey ? t("akCopied") : t("akCopy")}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        labelledBy="revoke-key-title"
        title={t("akRevokeTitle")}
        subtitle={
          revokeTarget
            ? t("akRevokeSubtitle", { label: revokeTarget.label })
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              {t("akBack")}
            </Button>
            <Button variant="danger" onClick={confirmRevoke} disabled={revoking}>
              {revoking && <Loader2 size={14} className="animate-spin-slow" />}
              {t("akRevokeBtn")}
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
