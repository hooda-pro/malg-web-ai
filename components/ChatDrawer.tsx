"use client";

import {
  Code2,
  LogIn,
  LogOut,
  MessageSquare,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ChatSession, SessionUser } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { Button, IconButton } from "./ui/Controls";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function ChatDrawer({
  open,
  onClose,
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onClearAll,
  user,
  onOpenAuth,
  onLogout,
  onOpenSettings,
}: {
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onClearAll: () => void;
  user: SessionUser | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenSettings: () => void;
}) {
  const { t, dir } = useSettings();

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="animate-fade fixed inset-0 z-overlay bg-black/20 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        aria-label={t("chatHistory")}
        className={cn(
          "fixed inset-y-0 start-0 z-sheet flex w-[86%] max-w-[320px] shrink-0 flex-col",
          "border-e border-hair bg-surface transition-transform duration-3 ease-soft",
          "lg:static lg:z-auto lg:w-[292px] lg:max-w-none lg:translate-x-0 rtl:lg:translate-x-0",
          open ? "translate-x-0 shadow-3" : "-translate-x-full rtl:translate-x-full",
          dir === "rtl" ? "lg:border-s lg:border-e-0" : ""
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-micro text-ink-3">
            {t("chatHistory")}
          </h2>
          <IconButton label={t("closeDrawer")} onClick={onClose} size="sm" className="lg:hidden">
            <X size={17} />
          </IconButton>
        </div>

        <div className="px-3 pb-3">
          <Button
            variant="secondary"
            onClick={onNewChat}
            className="w-full justify-start rounded-md"
            aria-label={t("newChat")}
          >
            <Plus size={16} />
            {t("newChat")}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center gap-2.5 px-4 py-10 text-center">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-3 text-ink-3">
                <MessageSquare size={16} />
              </span>
              <p className="text-pretty text-[12.5px] leading-5 text-ink-3">{t("noSessions")}</p>
            </div>
          ) : (
            <ul className="overflow-hidden rounded-md border border-hair bg-surface-2">
              {sessions.map((s) => {
                const active = s.id === currentSessionId;
                return (
                  <li
                    key={s.id}
                    className="group relative flex items-center border-b border-hair last:border-b-0"
                  >
                    <button
                      onClick={() => onSelectSession(s.id)}
                      aria-current={active}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-start",
                        "transition-colors duration-1",
                        active ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:bg-surface-3"
                      )}
                    >
                      <MessageSquare
                        size={14}
                        className={cn("shrink-0", active ? "text-accent" : "text-ink-3")}
                      />
                      <span dir="auto" className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {s.title}
                      </span>
                      <span className="tnum shrink-0 text-[11px] text-ink-3">
                        {formatTime(s.updatedAt)}
                      </span>
                    </button>
                    <button
                      onClick={() => onDeleteSession(s.id)}
                      title={t("deleteChat")}
                      aria-label={t("deleteChat")}
                      className={cn(
                        "grid h-9 w-7 shrink-0 place-items-center text-ink-3",
                        "opacity-0 transition-opacity duration-1 hover:text-danger",
                        "group-hover:opacity-100 focus-visible:opacity-100"
                      )}
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {sessions.length > 0 && (
          <div className="px-3 pb-2">
            <button
              onClick={onClearAll}
              className="w-full rounded-md py-2 text-[12px] font-medium text-ink-3 transition-colors duration-1 hover:bg-danger-soft hover:text-danger"
            >
              {t("clearAll")}
            </button>
          </div>
        )}

        <div className="border-t border-hair p-3">
          {/* روابط سريعة — واجهة المطوّرين، شحن الرصيد، ولوحة الأدمن للأدمن بس */}
          <nav className="mb-2 space-y-0.5">
            <Link
              href="/developers"
              onClick={onClose}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
            >
              <Code2 size={15} className="shrink-0" />
              واجهة المطوّرين · API
            </Link>
            <Link
              href="/topup"
              onClick={onClose}
              className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
            >
              <Wallet size={15} className="shrink-0" />
              شحن الرصيد
            </Link>
            {user?.isAdmin && (
              <Link
                href="/admin"
                onClick={onClose}
                className="flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
              >
                <ShieldCheck size={15} className="shrink-0 text-accent" />
                لوحة التحكم
              </Link>
            )}
          </nav>

          {user ? (
            <div className="flex items-center gap-1">
              <button
                onClick={onOpenSettings}
                title={t("accountSettings")}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 text-start transition-colors duration-1 hover:bg-surface-3"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
                  {user.isAdmin ? <ShieldCheck size={14} /> : user.displayName[0]?.toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {user.displayName}
                  </span>
                  <span className="block truncate text-[11px] text-ink-3" dir="ltr">
                    {user.email}
                  </span>
                </span>
                <Settings2 size={15} className="shrink-0 text-ink-3" />
              </button>
              <IconButton label={t("logout")} onClick={onLogout} size="sm">
                <LogOut size={15} />
              </IconButton>
            </div>
          ) : (
            <Button variant="primary" onClick={onOpenAuth} className="w-full">
              <LogIn size={16} />
              {t("loginOrRegister")}
            </Button>
          )}
        </div>
      </aside>
    </>
  );
}
