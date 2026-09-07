"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ScrollText,
  ShieldCheck,
  Terminal,
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
    <div className="flex h-[100dvh] overflow-hidden">
      {/* ——— القايمة الجانبية ——— */}
      <aside className="flex w-16 shrink-0 flex-col border-l border-line bg-panel md:w-60">
        <div className="flex items-center justify-center gap-2 border-b border-line px-3 py-4 md:justify-start md:px-4">
          <Terminal size={20} className="shrink-0 text-green" />
          <div className="hidden md:block">
            <p className="mono text-[13px] font-bold leading-tight text-txt">mlag ADMIN</p>
            <p className="mono text-[10px] leading-tight text-txt3">لوحة الإدارة</p>
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
                className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] transition-colors md:px-3 ${
                  active
                    ? "bg-green/10 font-bold text-green"
                    : "text-txt2 hover:bg-panel3 hover:text-txt"
                }`}
              >
                <Icon size={17} className="shrink-0" />
                <span className="hidden md:inline">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-line px-2 py-3">
          <a
            href="/#"
            title="رجوع للموقع"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] text-txt2 transition-colors hover:bg-panel3 hover:text-txt md:px-3"
          >
            <MessageSquare size={17} className="shrink-0" />
            <span className="hidden md:inline">رجوع للموقع</span>
          </a>
          <button
            onClick={onLogout}
            title="تسجيل خروج الأدمن"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[12.5px] text-txt2 transition-colors hover:bg-rose/10 hover:text-rose md:px-3"
          >
            <LogOut size={17} className="shrink-0" />
            <span className="hidden md:inline">خروج</span>
          </button>
        </div>
      </aside>

      {/* ——— المحتوى ——— */}
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line bg-panel/60 px-4 py-3 md:px-6">
          <h1 className="mono text-sm font-bold text-txt">
            {section === "users" && selectedUserId ? "تفاصيل المستخدم" : SECTION_TITLES[section]}
          </h1>
          <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-1.5">
            <ShieldCheck size={14} className="text-green" />
            <span className="hidden text-[11.5px] text-txt2 sm:inline" dir="ltr">
              {admin.email}
            </span>
            <span className="rounded bg-green/15 px-1.5 py-0.5 text-[10px] font-bold text-green">
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
        <div className="fixed bottom-6 left-1/2 z-[70] w-[92%] max-w-sm -translate-x-1/2 animate-slideUp">
          <div
            className={`flex items-center gap-2 rounded-md border px-3 py-2.5 shadow-lg backdrop-blur ${
              notice.type === "ok"
                ? "border-green/40 bg-panel/95 glow-green"
                : "border-rose/50 bg-panel/95"
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