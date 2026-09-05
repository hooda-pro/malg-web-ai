"use client";

import { LogIn, LogOut, MessageCircle, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import type { ChatSession, SessionUser } from "@/lib/types";
import { formatTime } from "@/lib/utils";

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
}) {
  return (
    <>
      {open && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[1px]"
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-50 flex w-[82%] max-w-[300px] flex-col border-l border-line bg-panel transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-3 py-3">
          <span className="mono text-xs font-bold text-green">$ mlag --sessions</span>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={16} />
          </button>
        </div>

        <div className="p-2.5">
          <button
            onClick={onNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-green/40 bg-green/10 py-2 text-[12.5px] font-medium text-green hover:bg-green/15"
          >
            <Plus size={14} /> محادثة جديدة
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {sessions.length === 0 && (
            <p className="mt-6 text-center text-[11.5px] text-txt3">لا يوجد محادثات بعد</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelectSession(s.id)}
              className={`group mb-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-right ${
                s.id === currentSessionId
                  ? "border border-cyan/40 bg-cyan/10"
                  : "border border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <MessageCircle size={14} className="shrink-0 text-txt3" />
              <span className="flex-1 truncate text-[12px] text-txt2">{s.title}</span>
              <span className="shrink-0 text-[9px] text-txt3">{formatTime(s.updatedAt)}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(s.id);
                }}
                className="shrink-0 rounded p-1 text-txt3 opacity-0 hover:text-rose group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </span>
            </button>
          ))}
        </div>

        {sessions.length > 0 && (
          <div className="px-2.5 pb-2">
            <button
              onClick={onClearAll}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line2 py-1.5 text-[11px] text-txt3 hover:border-rose/40 hover:text-rose"
            >
              <Trash2 size={12} /> مسح كل المحادثات
            </button>
          </div>
        )}

        <div className="border-t border-line p-3">
          {user ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-green/40 bg-green/10">
                  {user.isAdmin ? (
                    <ShieldCheck size={13} className="text-green" />
                  ) : (
                    <span className="mono text-[11px] text-green">{user.displayName[0]?.toUpperCase()}</span>
                  )}
                </div>
                <div className="overflow-hidden">
                  <p className="truncate text-[12px] font-medium text-txt">{user.displayName}</p>
                  <p className="truncate text-[10px] text-txt3">{user.email}</p>
                </div>
              </div>
              <button onClick={onLogout} className="shrink-0 rounded p-1.5 text-txt3 hover:text-rose">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-cyan/40 bg-cyan/10 py-2 text-[12.5px] font-medium text-cyan hover:bg-cyan/15"
            >
              <LogIn size={14} /> تسجيل الدخول / حساب جديد
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
