"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Coins,
  Database,
  Download,
  KeyRound,
  LogOut,
  RefreshCw,
  Settings2,
  Trash2,
  UserRound,
  Wand2,
  Zap,
} from "lucide-react";
import type { ChatMessage, ChatSession, SessionUser } from "@/lib/types";
import { LANGUAGES, type Lang } from "@/lib/i18n";
import { formatTokens } from "@/lib/ai";
import { Button, Dialog, Panel, Switch } from "./ui/Controls";
import { Avatar, ThemeSwitch, type SettingsTab } from "./AccountMenu";
import {
  AVAILABLE_MODELS,
  CUSTOM_INSTRUCTIONS_MAX,
  useSettings,
  type ModelId,
} from "./SettingsContext";
import { cn } from "@/lib/utils";

const TABS: { id: SettingsTab; icon: typeof Settings2; labelKey: string; needsUser?: boolean }[] = [
  { id: "general", icon: Settings2, labelKey: "settingsGeneral" },
  { id: "personalization", icon: Wand2, labelKey: "settingsPersonalization" },
  { id: "billing", icon: Coins, labelKey: "settingsBilling", needsUser: true },
  { id: "data", icon: Database, labelKey: "settingsData", needsUser: true },
  { id: "account", icon: UserRound, labelKey: "settingsAccountTab", needsUser: true },
];

const selectClass = cn(
  "h-9 min-w-[150px] cursor-pointer appearance-none rounded-full border border-hair bg-surface pe-9 ps-3.5 text-[13px] font-medium text-ink shadow-1",
  "transition-colors duration-1 hover:border-hair-2 focus:border-accent focus:outline-none"
);

export default function SettingsModal({
  user,
  quota,
  initialTab = "general",
  sessionsCount,
  onClose,
  onNameUpdated,
  onLogout,
  onOpenRecharge,
  onClearAll,
  onToast,
}: {
  user: SessionUser | null;
  quota: { total: number; used: number } | null;
  initialTab?: SettingsTab;
  sessionsCount: number;
  onClose: () => void;
  onNameUpdated: (newName: string) => void;
  onLogout: () => void;
  onOpenRecharge: () => void;
  onClearAll: () => Promise<void>;
  onToast: (msg: string) => void;
}) {
  const { t } = useSettings();
  const tabs = TABS.filter((tab) => !tab.needsUser || user);
  const [tab, setTab] = useState<SettingsTab>(
    tabs.some((x) => x.id === initialTab) ? initialTab : "general"
  );

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="mlag-settings-title"
      title={t("settingsTitle")}
      size="lg"
      bodyClassName="p-0"
    >
      <div className="flex min-h-0 flex-col border-t border-hair sm:h-[min(520px,70dvh)] sm:flex-row">
        <nav
          aria-label={t("settingsTitle")}
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-hair px-3 py-2 sm:w-52 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-e sm:p-3"
        >
          {tabs.map(({ id, icon: Icon, labelKey }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2.5 rounded-md px-3 text-[13.5px] font-medium transition-colors duration-1",
                  active ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:bg-surface-3 hover:text-ink"
                )}
              >
                <Icon size={15} className={active ? "text-accent" : "text-ink-3"} />
                {t(labelKey)}
              </button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 sm:px-6">
          <div key={tab} className="animate-fade">
            {tab === "general" && <GeneralTab />}
            {tab === "personalization" && <PersonalizationTab />}
            {tab === "billing" && user && (
              <BillingTab
                user={user}
                quota={quota}
                onOpenRecharge={() => {
                  onClose();
                  onOpenRecharge();
                }}
              />
            )}
            {tab === "data" && user && (
              <DataTab sessionsCount={sessionsCount} onClearAll={onClearAll} onToast={onToast} />
            )}
            {tab === "account" && user && (
              <AccountTab
                user={user}
                onNameUpdated={onNameUpdated}
                onLogout={() => {
                  onClose();
                  onLogout();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function SelectWrap({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-flex">
      {children}
      <ChevronDown
        size={14}
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-3"
        aria-hidden="true"
      />
    </span>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 mt-6 px-1 text-[12px] font-semibold uppercase tracking-micro text-ink-3 first:mt-0">
      {children}
    </h3>
  );
}

function SettingRow({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-hair px-4 py-3.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <label htmlFor={htmlFor} className="block text-[14px] text-ink">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-pretty text-[12.5px] leading-5 text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralTab() {
  const { t, lang, theme, model, animations, showTime, enterToSend, setLang, setTheme, setModel, setAnimations, setShowTime, update } =
    useSettings();

  return (
    <>
      <SectionTitle>{t("appearance")}</SectionTitle>
      <Panel>
        <SettingRow label={t("themeLabel")}>
          <ThemeSwitch value={theme} onChange={setTheme} />
        </SettingRow>
        <SettingRow label={t("settingsLang")} htmlFor="mlag-lang">
          <SelectWrap>
          <select
            id="mlag-lang"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className={selectClass}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          </SelectWrap>
        </SettingRow>
        <SettingRow label={t("settingsAnim")} hint={t("animHint")}>
          <Switch checked={animations} onChange={setAnimations} label={t("settingsAnim")} />
        </SettingRow>
      </Panel>

      <SectionTitle>{t("preferences")}</SectionTitle>
      <Panel>
        <SettingRow label={t("defaultModel")} hint={t("defaultModelHint")} htmlFor="mlag-model">
          <SelectWrap>
          <select
            id="mlag-model"
            value={model}
            onChange={(e) => setModel(e.target.value as ModelId)}
            className={selectClass}
          >
            {AVAILABLE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
          </SelectWrap>
        </SettingRow>
        <SettingRow label={t("enterToSend")} hint={t("enterToSendHint")}>
          <Switch checked={enterToSend} onChange={(v) => update("enterToSend", v)} label={t("enterToSend")} />
        </SettingRow>
        <SettingRow label={t("settingsShowTime")} hint={t("showTimeHint")}>
          <Switch checked={showTime} onChange={setShowTime} label={t("settingsShowTime")} />
        </SettingRow>
      </Panel>
    </>
  );
}

function PersonalizationTab() {
  const { t, nickname, customInstructions, update } = useSettings();

  return (
    <>
      <SectionTitle>{t("settingsPersonalization")}</SectionTitle>
      <div className="flex flex-col gap-5">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">{t("nicknameLabel")}</span>
          <input
            value={nickname}
            maxLength={40}
            onChange={(e) => update("nickname", e.target.value)}
            placeholder={t("nicknamePh")}
            className={cn(
              "h-11 w-full rounded-md border border-hair bg-surface px-3.5 text-[14.5px] text-ink shadow-1",
              "placeholder:text-ink-3 transition-all duration-1 hover:border-hair-2",
              "focus:border-accent focus:outline-none focus:shadow-[0_0_0_3.5px_var(--accent-soft)]"
            )}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-medium text-ink">{t("customInstrLabel")}</span>
          <span className="mb-2 block text-pretty text-[12.5px] leading-5 text-ink-3">
            {t("customInstrHint")}
          </span>
          <textarea
            value={customInstructions}
            maxLength={CUSTOM_INSTRUCTIONS_MAX}
            onChange={(e) => update("customInstructions", e.target.value)}
            placeholder={t("customInstrPh")}
            rows={7}
            dir="auto"
            className={cn(
              "w-full resize-y rounded-md border border-hair bg-surface px-3.5 py-3 text-[14px] leading-6 text-ink shadow-1",
              "placeholder:text-ink-3 transition-all duration-1 hover:border-hair-2",
              "focus:border-accent focus:outline-none focus:shadow-[0_0_0_3.5px_var(--accent-soft)]"
            )}
          />
          <span className="mt-1.5 flex items-center justify-between text-[12px] text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <Check size={12} className="text-live" />
              {t("savedLocally")}
            </span>
            <span className="tnum" dir="ltr">
              {customInstructions.length} / {CUSTOM_INSTRUCTIONS_MAX}
            </span>
          </span>
        </label>
      </div>
    </>
  );
}

function BillingTab({
  user,
  quota,
  onOpenRecharge,
}: {
  user: SessionUser;
  quota: { total: number; used: number } | null;
  onOpenRecharge: () => void;
}) {
  const { t } = useSettings();
  const remaining = quota ? Math.max(quota.total - quota.used, 0) : 0;
  const pct = quota && quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0;

  return (
    <>
      <SectionTitle>{t("usageTitle")}</SectionTitle>
      <Panel className="p-5">
        {user.isAdmin ? (
          <p className="flex items-center gap-2 text-[14px] text-ink">
            <Zap size={15} className="text-accent" />
            {t("usageUnlimited")}
          </p>
        ) : (
          <>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[12.5px] text-ink-3">{t("usageRemaining")}</p>
                <p className="tnum mt-1 text-[30px] font-semibold leading-none tracking-display text-ink">
                  {quota ? formatTokens(remaining) : "—"}
                </p>
              </div>
              <Button variant="primary" size="sm" onClick={onOpenRecharge}>
                <Coins size={14} />
                {t("menuBuyTokens")}
              </Button>
            </div>
            <div
              className="mt-5 h-2 overflow-hidden rounded-full bg-surface-3"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(pct)}
            >
              <div
                className={cn("h-full rounded-full", pct >= 90 ? "bg-danger" : "bg-accent")}
                style={{ width: `${Math.max(pct, 1.5)}%` }}
              />
            </div>
            <p className="tnum mt-2 text-[12.5px] text-ink-3">
              {quota
                ? t("usageUsed", { used: formatTokens(quota.used), total: formatTokens(quota.total) })
                : "…"}
            </p>
            <p className="mt-4 border-t border-hair pt-3 text-pretty text-[12.5px] leading-5 text-ink-2">
              {t("usageRenew")}
            </p>
          </>
        )}
      </Panel>

      <SectionTitle>{t("apiCreditsTitle")}</SectionTitle>
      <Panel>
        <a
          href="/#/api"
          className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-1 hover:bg-surface-3"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-accent-soft text-accent">
            <KeyRound size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] text-ink">{t("openApiConsole")}</span>
            <span className="block text-pretty text-[12.5px] leading-5 text-ink-3">{t("apiCreditsHint")}</span>
          </span>
          <ArrowUpRight size={16} className="flip-rtl shrink-0 text-ink-3" />
        </a>
      </Panel>
    </>
  );
}

function DataTab({
  sessionsCount,
  onClearAll,
  onToast,
}: {
  sessionsCount: number;
  onClearAll: () => Promise<void>;
  onToast: (msg: string) => void;
}) {
  const { t } = useSettings();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const exportChats = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      const sessions: ChatSession[] = data.sessions || [];
      const withMessages = await Promise.all(
        sessions.map(async (s) => {
          const r = await fetch(`/api/messages/${s.id}`);
          const d = await r.json();
          const messages: ChatMessage[] = d.messages || [];
          return {
            id: s.id,
            title: s.title,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
              tokensUsed: m.tokensUsed,
            })),
          };
        })
      );
      const blob = new Blob(
        [JSON.stringify({ exportedAt: new Date().toISOString(), chats: withMessages }, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mlag-chats-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onToast(t("exportDone", { n: withMessages.length }));
    } catch {
      onToast(t("exportFail"));
    } finally {
      setExporting(false);
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    try {
      await onClearAll();
      onToast(t("deleteAllDone"));
      setConfirming(false);
    } catch {
      // الشل بيعرض رسالة الخطأ بنفسه
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <SectionTitle>{t("settingsData")}</SectionTitle>
      <Panel>
        <SettingRow label={t("exportChats")} hint={t("exportChatsHint")}>
          <Button size="sm" onClick={exportChats} disabled={exporting || sessionsCount === 0}>
            {exporting ? <RefreshCw size={13} className="animate-spin-slow" /> : <Download size={13} />}
            {exporting ? t("exporting") : t("exportBtn")}
          </Button>
        </SettingRow>
        <SettingRow label={t("deleteAllChats")} hint={t("deleteAllHint")}>
          {!confirming && (
            <Button
              size="sm"
              onClick={() => setConfirming(true)}
              disabled={sessionsCount === 0}
              className="!text-danger hover:!border-danger"
            >
              <Trash2 size={13} />
              {t("deleteBtn")}
            </Button>
          )}
        </SettingRow>
        {confirming && (
          <div role="alertdialog" aria-labelledby="mlag-del-title" className="animate-fade border-t border-hair bg-danger-soft px-4 py-4">
            <p id="mlag-del-title" className="text-[14px] font-semibold text-ink">
              {t("confirmDeleteAllTitle")}
            </p>
            <p className="mt-1 text-pretty text-[12.5px] leading-5 text-ink-2">
              {t("confirmDeleteAllMsg", { n: sessionsCount })}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={deleting}>
                {t("cancel")}
              </Button>
              <Button size="sm" variant="danger" onClick={deleteAll} disabled={deleting}>
                {deleting ? <RefreshCw size={13} className="animate-spin-slow" /> : <Trash2 size={13} />}
                {t("deleteAllChats")}
              </Button>
            </div>
          </div>
        )}
      </Panel>
    </>
  );
}

function AccountTab({
  user,
  onNameUpdated,
  onLogout,
}: {
  user: SessionUser;
  onNameUpdated: (newName: string) => void;
  onLogout: () => void;
}) {
  const { t } = useSettings();
  const [nameDraft, setNameDraft] = useState(user.displayName);
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [nameError, setNameError] = useState<string | null>(null);

  const saveName = async () => {
    const newName = nameDraft.trim();
    if (!newName) {
      setNameError(t("errName"));
      return;
    }
    if (newName === user.displayName) return;
    setNameStatus("saving");
    setNameError(null);
    try {
      const res = await fetch("/api/auth/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNameError(data.error || t("errGeneric"));
        setNameStatus("idle");
        return;
      }
      setNameStatus("saved");
      onNameUpdated(data.user.displayName);
      setTimeout(() => setNameStatus("idle"), 2500);
    } catch {
      setNameError(t("errConn"));
      setNameStatus("idle");
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <Avatar user={user} size={52} />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold tracking-title text-ink">{user.displayName}</p>
          <p className="truncate text-[13px] text-ink-3" dir="ltr">
            {user.email}
          </p>
        </div>
      </div>

      <SectionTitle>{t("settingsAccountTab")}</SectionTitle>
      <Panel>
        <div className="border-b border-hair px-4 py-3.5">
          <label htmlFor="mlag-name" className="mb-2 block text-[14px] text-ink">
            {t("displayNameLabel")}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="mlag-name"
              value={nameDraft}
              onChange={(e) => {
                setNameDraft(e.target.value);
                setNameStatus("idle");
                setNameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) saveName();
              }}
              placeholder={t("phName")}
              maxLength={40}
              className={cn(
                "h-10 min-w-0 flex-1 rounded-md border border-hair bg-surface-2 px-3",
                "text-[14px] text-ink placeholder:text-ink-3 transition-all duration-1",
                "hover:border-hair-2 focus:border-accent focus:bg-surface focus:outline-none",
                "focus:shadow-[0_0_0_3.5px_var(--accent-soft)]"
              )}
            />
            <Button
              size="sm"
              variant="primary"
              onClick={saveName}
              disabled={nameStatus === "saving" || !nameDraft.trim() || nameDraft.trim() === user.displayName}
            >
              {nameStatus === "saving" ? (
                <>
                  <RefreshCw size={12} className="animate-spin-slow" />
                  {t("saving")}
                </>
              ) : nameStatus === "saved" ? (
                <>
                  <Check size={12} />
                  {t("nameSaved")}
                </>
              ) : (
                t("save")
              )}
            </Button>
          </div>
          {nameError && (
            <p role="alert" className="mt-2 text-[12px] text-danger">
              {nameError}
            </p>
          )}
        </div>
        <SettingRow label={t("emailLabel")}>
          <span className="text-[13.5px] text-ink-2" dir="ltr">
            {user.email}
          </span>
        </SettingRow>
      </Panel>

      <div className="mt-6">
        <Panel>
          <SettingRow label={t("logout")} hint={t("logoutHint")}>
            <Button size="sm" onClick={onLogout}>
              <LogOut size={13} className="flip-rtl" />
              {t("logout")}
            </Button>
          </SettingRow>
        </Panel>
      </div>
    </>
  );
}
