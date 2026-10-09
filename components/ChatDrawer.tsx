"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, LogIn, PanelLeftClose, Pin, Search, Sparkles, SquarePen, Timer, Trash2, X } from "lucide-react";
import type { ChatSession, SessionUser } from "@/lib/types";
import type { SubscriptionInfo } from "@/lib/plans";
import { Button, IconButton, Kbd, modKeyLabel } from "./ui/Controls";
import AccountMenu, { type SettingsTab } from "./AccountMenu";
import Logo from "./Logo";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

type GroupKey = "groupToday" | "groupYesterday" | "groupWeek" | "groupOlder";

function groupSessions(sessions: ChatSession[]): { key: GroupKey; items: ChatSession[] }[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups: Record<GroupKey, ChatSession[]> = {
    groupToday: [],
    groupYesterday: [],
    groupWeek: [],
    groupOlder: [],
  };
  for (const s of sessions) {
    const ts = new Date(s.updatedAt).getTime();
    if (ts >= startOfToday) groups.groupToday.push(s);
    else if (ts >= startOfToday - day) groups.groupYesterday.push(s);
    else if (ts >= startOfToday - 7 * day) groups.groupWeek.push(s);
    else groups.groupOlder.push(s);
  }
  return (Object.keys(groups) as GroupKey[])
    .filter((k) => groups[k].length > 0)
    .map((k) => ({ key: k, items: groups[k] }));
}

type SessionWithSnippet = ChatSession & { snippet?: string | null };

function SessionRow({
  s,
  active,
  snippet,
  onSelectSession,
  onDeleteSession,
  onTogglePin,
  onExportSession,
}: {
  s: ChatSession;
  active: boolean;
  snippet?: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onExportSession: (id: string) => void;
}) {
  const { t } = useSettings();
  return (
    <li className="group relative">
      <button
        onClick={() => onSelectSession(s.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex h-9 w-full items-center rounded-md pe-[104px] ps-2.5 text-start transition-colors duration-1",
          active ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:bg-surface-3 hover:text-ink"
        )}
      >
        <span dir="auto" className="min-w-0 flex-1 truncate text-[13.5px]">
          {s.title}
        </span>
      </button>
      {snippet && (
        <p dir="auto" className="truncate px-2.5 pb-1 text-[11.5px] leading-4 text-ink-3">
          <span className="text-accent">{t("searchInContent")}</span>
          {" — "}
          {snippet}
        </p>
      )}
      <div className="absolute end-1 top-[18px] flex -translate-y-1/2 items-center opacity-0 transition-opacity duration-1 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          onClick={() => onTogglePin(s.id, !s.isPinned)}
          title={s.isPinned ? t("unpinChat") : t("pinChat")}
          aria-label={`${s.isPinned ? t("unpinChat") : t("pinChat")}: ${s.title}`}
          aria-pressed={!!s.isPinned}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-full transition-colors duration-1 hover:bg-surface-3",
            s.isPinned ? "text-accent opacity-100" : "text-ink-3 hover:text-ink"
          )}
        >
          <Pin size={13} className={cn(s.isPinned && "fill-accent")} />
        </button>
        <button
          onClick={() => onExportSession(s.id)}
          title={t("exportChatMd")}
          aria-label={`${t("exportChatMd")}: ${s.title}`}
          className="grid h-7 w-7 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
        >
          <Download size={13} />
        </button>
        <button
          onClick={() => onDeleteSession(s.id)}
          title={t("deleteChat")}
          aria-label={`${t("deleteChat")}: ${s.title}`}
          className="grid h-7 w-7 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </li>
  );
}

export default function ChatDrawer({
  open,
  collapsed,
  onClose,
  onCollapse,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onTogglePin,
  onExportSession,
  onNewTempChat,
  inTempMode,
  user,
  quota,
  subscription,
  onOpenAuth,
  onLogout,
  onOpenSettings,
  onOpenRecharge,
  onOpenPlans,
  onOpenShortcuts,
}: {
  open: boolean;
  collapsed: boolean;
  onClose: () => void;
  onCollapse: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onExportSession: (id: string) => void;
  onNewTempChat: () => void;
  inTempMode: boolean;
  user: SessionUser | null;
  quota: { total: number; used: number } | null;
  subscription: SubscriptionInfo | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenSettings: (tab?: SettingsTab) => void;
  onOpenRecharge: () => void;
  onOpenPlans: () => void;
  onOpenShortcuts: () => void;
}) {
  const { t } = useSettings();
  const [query, setQuery] = useState("");
  const [mod, setMod] = useState("Ctrl");
  useEffect(() => setMod(modKeyLabel()), []);

  // بحث شامل: عنوان + نص الرسايل عبر السيرفر (العناوين لوحدها لا تكفي).
  // أقل من حرفين = فلترة محلية سريعة بالعناوين.
  const trimmed = query.trim();
  const isSearching = trimmed.length >= 2;
  const [remote, setRemote] = useState<SessionWithSnippet[] | null>(null);
  useEffect(() => {
    if (!isSearching) {
      setRemote(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sessions/search?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json().catch(() => ({}));
        if (!cancelled) setRemote(Array.isArray(data.sessions) ? data.sessions : []);
      } catch {
        if (!cancelled) setRemote([]);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  const filtered = useMemo(() => {
    const q = trimmed.toLowerCase();
    return q ? sessions.filter((s) => s.title.toLowerCase().includes(q)) : sessions;
  }, [sessions, trimmed]);
  const pinned = useMemo(() => filtered.filter((s) => s.isPinned), [filtered]);
  const groups = useMemo(
    () => groupSessions(filtered.filter((s) => !s.isPinned)),
    [filtered]
  );

  const rowProps = { onSelectSession, onDeleteSession, onTogglePin, onExportSession };

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="animate-fade fixed inset-0 z-overlay bg-black/25 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        aria-label={t("chatHistory")}
        className={cn(
          "m-drawer fixed inset-y-0 start-0 z-sheet flex w-[86%] max-w-[320px] shrink-0 flex-col",
          "border-e border-hair bg-surface-2 transition-transform duration-3 ease-soft",
          "lg:static lg:z-auto lg:w-[280px] lg:max-w-none lg:translate-x-0 rtl:lg:translate-x-0",
          open ? "translate-x-0 shadow-3 lg:shadow-none" : "-translate-x-full rtl:translate-x-full",
          collapsed && "lg:hidden"
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
          <a href="/#" className="flex min-w-0 items-center gap-2.5 rounded-md px-1.5 py-1" aria-label="MALG AI">
            <span className="grid h-7 w-7 shrink-0 place-items-center text-ink">
              <Logo size={25} />
            </span>
            <span className="truncate text-[15px] font-semibold tracking-title text-ink">MALG AI</span>
          </a>
          <div className="flex items-center">
            <IconButton label={t("toggleSidebar")} onClick={onCollapse} size="sm" className="hidden lg:inline-flex">
              <PanelLeftClose size={17} className="flip-rtl" />
            </IconButton>
            <IconButton label={t("closeDrawer")} onClick={onClose} size="sm" className="lg:hidden">
              <X size={17} />
            </IconButton>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-3 pb-2">
          <button
            onClick={onNewChat}
            className={cn(
              "group flex h-10 w-full items-center gap-2.5 rounded-md border border-hair bg-surface px-3",
              "text-[13.5px] font-medium text-ink shadow-1 transition-colors duration-1 hover:border-hair-2"
            )}
          >
            <SquarePen size={16} className="text-ink-2" />
            <span className="flex-1 text-start">{t("newChat")}</span>
            <span className="hidden items-center gap-1 opacity-0 transition-opacity duration-1 group-hover:opacity-100 lg:flex">
              <Kbd>{mod}</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>O</Kbd>
            </span>
          </button>

          <button
            onClick={onNewTempChat}
            aria-pressed={inTempMode}
            className={cn(
              "flex h-10 w-full items-center gap-2.5 rounded-md border px-3",
              "text-[13.5px] font-medium transition-colors duration-1",
              inTempMode
                ? "border-accent-line bg-accent-soft text-ink"
                : "border border-hair bg-surface text-ink-2 shadow-1 hover:border-hair-2 hover:text-ink"
            )}
          >
            <Timer size={16} className={inTempMode ? "text-accent" : "text-ink-3"} />
            <span className="flex-1 text-start">{t("tempChat")}</span>
          </button>

          {sessions.length > 0 && (
            <label className="relative block">
              <span className="sr-only">{t("searchChats")}</span>
              <Search
                size={14}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchChats")}
                className={cn(
                  "h-9 w-full rounded-md border border-transparent bg-surface-3 pe-3 ps-8 text-[13px] text-ink",
                  "placeholder:text-ink-3 transition-colors duration-1 focus:border-accent-line focus:bg-surface focus:outline-none"
                )}
              />
            </label>
          )}
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {sessions.length === 0 ? (
            <p className="px-4 py-10 text-center text-pretty text-[12.5px] leading-5 text-ink-3">
              {user ? t("noSessions") : t("loginOrRegister")}
            </p>
          ) : isSearching ? (
            remote === null ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">{t("searching")}</p>
            ) : remote.length === 0 ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">{t("noResults")}</p>
            ) : (
              <ul className="mt-1">
                {remote.map((s) => (
                  <SessionRow key={s.id} s={s} active={s.id === currentSessionId} snippet={s.snippet ?? null} {...rowProps} />
                ))}
              </ul>
            )
          ) : (
            <>
              {pinned.length > 0 && (
                <section className="mt-1">
                  <h3 className="px-2.5 pb-1 text-[11.5px] font-medium text-ink-3">{t("pinnedSection")}</h3>
                  <ul>
                    {pinned.map((s) => (
                      <SessionRow key={s.id} s={s} active={s.id === currentSessionId} {...rowProps} />
                    ))}
                  </ul>
                </section>
              )}
              {groups.length === 0 && pinned.length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-ink-3">{t("noResults")}</p>
              ) : (
                groups.map((g) => (
                  <section key={g.key} className="mt-3 first:mt-1">
                    <h3 className="px-2.5 pb-1 text-[11.5px] font-medium text-ink-3">{t(g.key)}</h3>
                    <ul>
                      {g.items.map((s) => (
                        <SessionRow key={s.id} s={s} active={s.id === currentSessionId} {...rowProps} />
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </nav>

        <div className="border-t border-hair p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {user ? (
            <AccountMenu
              user={user}
              quota={quota}
              subscription={subscription}
              onOpenSettings={onOpenSettings}
              onOpenRecharge={onOpenRecharge}
              onOpenPlans={onOpenPlans}
              onOpenShortcuts={onOpenShortcuts}
              onLogout={onLogout}
            />
          ) : (
            <Button variant="primary" onClick={onOpenAuth} className="w-full">
              <LogIn size={16} className="flip-rtl" />
              {t("loginOrRegister")}
            </Button>
          )}
        </div>
      </aside>
    </>
  );
}
