"use client";

import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, Terminal, User, X } from "lucide-react";
import type { SessionUser } from "@/lib/types";

export default function AuthModal({
  onClose,
  onAuthenticated,
}: {
  onClose: () => void;
  onAuthenticated: (user: SessionUser) => void;
}) {
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError("يرجى إدخال بريد إلكتروني صحيح وكلمة مرور من 6 أحرف على الأقل");
      return;
    }
    if (tab === "register" && !name.trim()) {
      setError("يرجى إدخال اسمك — النموذج هيستخدمه عشان يناديك بيه");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${tab === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "حصل خطأ، حاول تاني");
        return;
      }
      onAuthenticated(data.user);
    } catch {
      setError("تعذر الاتصال بالسيرفر");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-line2 bg-panel glow-green">
        <div className="terminal-dots flex items-center justify-between border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-rose/70" />
              <span className="h-2 w-2 rounded-full bg-amber/70" />
              <span className="h-2 w-2 rounded-full bg-green/70" />
            </span>
            <span className="mono text-[11px] text-txt3">auth.sh</span>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-4 flex items-center justify-center gap-2">
            <Terminal size={18} className="text-green" />
            <h2 className="mono text-sm font-bold text-txt">
              {tab === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
            </h2>
          </div>

          <div className="mb-4 flex rounded-md border border-line2 p-0.5">
            <button
              onClick={() => setTab("login")}
              className={`flex-1 rounded py-1.5 text-[12px] ${
                tab === "login" ? "bg-green/15 text-green" : "text-txt3"
              }`}
            >
              دخول
            </button>
            <button
              onClick={() => setTab("register")}
              className={`flex-1 rounded py-1.5 text-[12px] ${
                tab === "register" ? "bg-green/15 text-green" : "text-txt3"
              }`}
            >
              حساب جديد
            </button>
          </div>

          <div className="space-y-2.5">
            {tab === "register" && (
              <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
                <User size={14} className="text-txt3" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="اسمك"
                  className="flex-1 bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
                />
              </div>
            )}
            <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
              <Mail size={14} className="text-txt3" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="البريد الإلكتروني"
                dir="ltr"
                className="flex-1 bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
              <Lock size={14} className="text-txt3" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="كلمة المرور (6 أحرف على الأقل)"
                dir="ltr"
                className="flex-1 bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button onClick={() => setShowPassword(!showPassword)} className="text-txt3 hover:text-txt">
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {error && <p className="text-[11.5px] text-rose">{error}</p>}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full rounded-md bg-green/15 py-2.5 text-[13px] font-bold text-green hover:bg-green/25 disabled:opacity-50"
            >
              {loading ? "جاري التنفيذ..." : tab === "login" ? "دخول" : "إنشاء الحساب"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
