"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronsUpDown,
  Coins,
  KeyRound,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Settings2,
  ShieldCheck,
  Sun,
  Wand2,
} from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { formatTokens } from "@/lib/ai";
import { Kbd, modKeyLabel } from "./ui/Controls";
import { useSettings, type Theme } from "./SettingsContext";
import { cn } from "@/lib/utils";

export type SettingsTab = "general" | "personalization" | "billing" | "data" | "account";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({ user, size = 32 }: { user: SessionUser; size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-accent text-[12px] font-semibold text-accent-ink shadow-edge"
      aria-hidden="true"
    >
      {user.isAdmin ? <ShieldCheck size={Math.round(size * 0.45)} /> : initials(user.displayName)}
    </span>
  );
}

/**
 * زرار الحساب في آخر القايمة الجانبية + القايمة اللي بتطلع منه
 * (شحن الرصيد، مفاتيح API، التخصيص، الإعدادات، الاختصارات، المظهر، الخروج).
 */
export default function AccountMenu({
  user,
  quota,
  onOpenSettings,
  onOpenRecharge,
  onOpenShortcuts,
  onLogout,
}: {
  user: SessionUser;
  quota: { total: number; used: number } | null;
  onOpenSettings: (tab?: SettingsTab) => void;
  onOpenRecharge: () => void;
  onOpenShortcuts: () => void;
  onLogout: () => void;
}) {
  const { t, theme, setTheme } = useSettings();
  const [open, setOpen] = useState(false);
  const [mod, setMod] = useState("Ctrl");
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMod(modKeyLabel()), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const items = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
      if (items.length === 0) return;
      e.preventDefault();
      const idx = items.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "ArrowDown"
          ? items[(idx + 1) % items.length]
          : items[(idx - 1 + items.length) % items.length];
      next.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  const remaining = quota ? Math.max(quota.total - quota.used, 0) : null;
  const usedPct = quota && quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 0;

  return (
    <div className="relative" ref={rootRef}>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t("accountMenu")}
          className="animate-materialize glass absolute inset-x-0 bottom-[calc(100%+8px)] z-modal overflow-hidden rounded-lg border border-hair shadow-3"
        >
          <div className="flex items-center gap-3 px-3.5 pb-3 pt-3.5">
            <Avatar user={user} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold text-ink">{user.displayName}</p>
              <p className="truncate text-[12px] text-ink-3" dir="ltr">
                {user.email}
              </p>
            </div>
          </div>

          <button
            role="menuitem"
            onClick={run(onOpenRecharge)}
            className="mx-2 mb-1 block w-[calc(100%-16px)] rounded-md border border-hair bg-surface px-3 py-2.5 text-start shadow-1 transition-colors duration-1 hover:border-accent-line focus-visible:border-accent-line"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-ink-2">
                {user.isAdmin ? t("planAdmin") : t("usageTitle")}
              </span>
              <span className="tnum text-[12px] font-semibold text-ink">
                {user.isAdmin
                  ? "∞"
                  : remaining !== null
                    ? t("tokensLeft", { n: formatTokens(remaining) })
                    : "—"}
              </span>
            </span>
            {!user.isAdmin && quota && (
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-3">
                <span
                  className={cn(
                    "block h-full rounded-full transition-[width] duration-3 ease-soft",
                    usedPct >= 90 ? "bg-danger" : "bg-accent"
                  )}
                  style={{ width: `${Math.max(usedPct, 2)}%` }}
                />
              </span>
            )}
            <span className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-accent">
              <Coins size={13} />
              {t("menuBuyTokens")}
            </span>
          </button>

          <MenuGroup>
            <MenuItem
              icon={<KeyRound size={16} />}
              label={t("menuApiKeys")}
              href="/#/api"
              onSelect={() => setOpen(false)}
              trailing={<ArrowUpRight size={14} className="flip-rtl text-ink-3" />}
            />
            <MenuItem
              icon={<Wand2 size={16} />}
              label={t("menuPersonalize")}
              onSelect={run(() => onOpenSettings("personalization"))}
            />
            <MenuItem
              icon={<Settings2 size={16} />}
              label={t("menuSettings")}
              onSelect={run(() => onOpenSettings("general"))}
              trailing={
                <span className="flex items-center gap-1">
                  <Kbd>{mod}</Kbd>
                  <Kbd>,</Kbd>
                </span>
              }
            />
            <MenuItem
              icon={<Keyboard size={16} />}
              label={t("menuShortcuts")}
              onSelect={run(onOpenShortcuts)}
              trailing={
                <span className="flex items-center gap-1">
                  <Kbd>{mod}</Kbd>
                  <Kbd>/</Kbd>
                </span>
              }
            />
          </MenuGroup>

          <div className="flex items-center justify-between gap-3 border-t border-hair px-3.5 py-2.5">
            <span className="text-[13px] text-ink-2">{t("menuAppearance")}</span>
            <ThemeSwitch value={theme} onChange={setTheme} />
          </div>

          <MenuGroup>
            {user.isAdmin && (
              <MenuItem
                icon={<LayoutDashboard size={16} />}
                label={t("drawerAdmin")}
                href="/#/admin"
                onSelect={() => setOpen(false)}
                trailing={<ArrowUpRight size={14} className="flip-rtl text-ink-3" />}
              />
            )}
            <MenuItem
              icon={<LogOut size={16} className="flip-rtl" />}
              label={t("logout")}
              onSelect={run(onLogout)}
              danger
            />
          </MenuGroup>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-start transition-colors duration-1",
          open ? "bg-surface-3" : "hover:bg-surface-3"
        )}
      >
        <Avatar user={user} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-ink">{user.displayName}</span>
          <span className="tnum block truncate text-[11.5px] text-ink-3">
            {user.isAdmin
              ? t("planAdmin")
              : remaining !== null
                ? `${t("planFree")} · ${t("tokensLeft", { n: formatTokens(remaining) })}`
                : t("planFree")}
          </span>
        </span>
        <ChevronsUpDown size={15} className="shrink-0 text-ink-3" />
      </button>
    </div>
  );
}

function MenuGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col border-t border-hair p-1.5 first:border-t-0">{children}</div>;
}

function MenuItem({
  icon,
  label,
  onSelect,
  href,
  trailing,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onSelect: () => void;
  href?: string;
  trailing?: ReactNode;
  danger?: boolean;
}) {
  const className = cn(
    "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-start text-[13.5px] outline-none transition-colors duration-1",
    danger
      ? "text-ink-2 hover:bg-danger-soft hover:text-danger focus-visible:bg-danger-soft focus-visible:text-danger"
      : "text-ink hover:bg-surface-3 focus-visible:bg-surface-3"
  );
  const content = (
    <>
      <span className={cn("shrink-0", danger ? "" : "text-ink-2")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );
  if (href) {
    return (
      <a role="menuitem" href={href} onClick={onSelect} className={className}>
        {content}
      </a>
    );
  }
  return (
    <button role="menuitem" onClick={onSelect} className={className}>
      {content}
    </button>
  );
}

export function ThemeSwitch({ value, onChange }: { value: Theme; onChange: (v: Theme) => void }) {
  const { t } = useSettings();
  const opts: { v: Theme; icon: ReactNode; label: string }[] = [
    { v: "system", icon: <Monitor size={14} />, label: t("themeSystem") },
    { v: "light", icon: <Sun size={14} />, label: t("themeLight") },
    { v: "dark", icon: <Moon size={14} />, label: t("themeDark") },
  ];
  return (
    <div role="radiogroup" aria-label={t("themeLabel")} className="inline-flex gap-0.5 rounded-full bg-surface-3 p-0.5">
      {opts.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.v)}
          className={cn(
            "grid h-7 w-8 place-items-center rounded-full transition-all duration-2 ease-soft",
            value === o.v ? "bg-surface text-ink shadow-1" : "text-ink-3 hover:text-ink"
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
