"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import type { SessionUser } from "@/lib/types";
import StatsOverview from "./StatsOverview";
import UsersList from "./UsersList";
import UserDetail from "./UserDetail";
import AdminLogs from "./AdminLogs";
import AdminSecurity from "./AdminSecurity";

type Section = "overview" | "users" | "logs" | "security";

const SECTIONS: { id: Section; label: string; icon: typeof Users }[] = [
  { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
  { id: "users", label: "المستخدمين", icon: Users },
  { id: "logs", label: "سجل الإجراءات", icon: ScrollText },
  { id: "security", label: "الأمان", icon: ShieldCheck },
];

const SECTION_TITLES: Record<Section, string> = {
  overview: "نظرة عامة",
  users: "المستخدمين",
  logs: "سجل إجراءات الأدمن",
  security: "أمان الحساب",
};

/** الهيكل الرئيسي للوحة: قايمة جانبية + محتوى متغير حسب القسم المختار */
export default function AdminPanel({
  admin,
  onLogout,
}: {
  admin: SessionUser;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<Section>("overview");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const notify = useCallback((type: "ok" | "err", text: string) => {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const openUser = useCallback((id: string) => {
    setSelectedUserId(id);
    setSection("users");
  }, []);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-ground text-ink">
      {/* ——— القايمة الجانبية ——— */}
      <aside className="flex w-16 shrink-0 flex-col border-l border-hair bg-surface md:w-60">
        <div className="flex items-center justify-center gap-2.5 border-b border-hair px-3 py-4 md:justify-start md:px-4">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-ink shadow-accent">
            <Sparkles size={16} />
          </span>
          <div className="hidden md:block">
            <p className="text-[13px] font-semibold leading-tight tracking-title text-ink">
              mlag admin
            </p>
            <p className="text-[11px] leading-tight text-ink-3">لوحة الإدارة</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setSection(id);
                  if (id !== "users") setSelectedUserId(null);
                }}
                title={label}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors duration-1 md:px-3 ${
                  active
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-ink-2 hover:bg-surface-3 hover:text-ink"
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-hair px-2 py-3">
          <a
            href="/#"
            title="رجوع للموقع"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink md:px-3"
          >
            <MessageSquare size={17} className="shrink-0" />
            <span className="hidden md:inline">رجوع للموقع</span>
          </a>
          <button
            onClick={onLogout}
            title="تسجيل خروج الأدمن"
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 transition-colors duration-1 hover:bg-danger-soft hover:text-danger md:px-3"
          >
            <LogOut size={17} className="shrink-0" />
            <span className="hidden md:inline">خروج</span>
          </button>
        </div>
      </aside>

      {/* ——— المحتوى ——— */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-hair bg-surface/70 px-4 py-3 md:px-6">
          <h1 className="text-[15px] font-semibold tracking-title text-ink">
            {section === "users" && selectedUserId ? "تفاصيل المستخدم" : SECTION_TITLES[section]}
          </h1>
          <div className="flex items-center gap-2 rounded-full border border-hair bg-surface px-3 py-1.5 shadow-1">
            <ShieldCheck size={14} className="text-accent" />
            <span className="hidden text-[12px] text-ink-2 sm:inline" dir="ltr">
              {admin.email}
            </span>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent">
              ADMIN
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {section === "overview" && <StatsOverview onSelectUser={openUser} />}
          {section === "users" &&
            (selectedUserId ? (
              <UserDetail
                userId={selectedUserId}
                isSelf={selectedUserId === admin.id}
                onBack={() => setSelectedUserId(null)}
                notify={notify}
              />
            ) : (
              <UsersList onSelect={openUser} />
            ))}
          {section === "logs" && <AdminLogs />}
          {section === "security" && <AdminSecurity admin={admin} notify={notify} />}
        </div>
      </main>

      {/* ——— إشعار عائم ——— */}
      {notice && (
        <div className="fixed bottom-6 left-1/2 z-toast w-[92%] max-w-sm -translate-x-1/2 animate-rise">
          <div
            className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 shadow-2 backdrop-blur ${
              notice.type === "ok"
                ? "border-hair bg-surface/95"
                : "border-danger/30 bg-surface/95"
            }`}
          >
            {notice.type === "ok" ? (
              <CheckCircle2 size={16} className="shrink-0 text-live" />
            ) : (
              <XCircle size={16} className="shrink-0 text-danger" />
            )}
            <p className="flex-1 text-[12.5px] leading-5 text-ink">{notice.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
