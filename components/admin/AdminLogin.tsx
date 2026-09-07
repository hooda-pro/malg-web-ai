"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert, Terminal } from "lucide-react";
import type { SessionUser } from "@/lib/types";

/** شاشة دخول الأدمن — نفس روح استايل auth.sh في الموقع */
export default function AdminLogin({ onLogin }: { onLogin: (admin: SessionUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email.trim() || password.length < 6) {
      setError("أدخل البريد الإلكتروني وكلمة المرور");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "تعذر تسجيل الدخول");
        return;
      }
      if (!data?.user?.isAdmin) {
        setError("الحساب ده مش حساب أدمن — لوحة الأدمن للأداريين بس");
        return;
      }
      onLogin(data.user as SessionUser);
    } catch {
      setError("مشكلة في الاتصال — حاول تاني");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-line2 bg-panel glow-green animate-slideUp">
        <div className="terminal-dots flex items-center justify-between border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-rose/70" />
              <span className="h-2 w-2 rounded-full bg-amber/70" />
              <span className="h-2 w-2 rounded-full bg-green/70" />
            </span>
            <span className="mono text-[11px] text-txt3">admin.sh — مخصص للأداريين</span>
          </div>
          <ShieldAlert size={15} className="text-amber" />
        </div>

        <div className="px-5 py-6">
          <div className="mb-1 flex items-center justify-center gap-2">
            <Terminal size={18} className="text-green" />
            <h1 className="mono text-sm font-bold text-txt">لوحة تحكم mlag</h1>
          </div>
          <p className="mb-5 text-center text-[11.5px] text-txt3">
            سجل دخول بحساب الأدمن للوصول إلى لوحة الإدارة
          </p>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
              <Mail size={14} className="text-txt3" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="البريد الإلكتروني للأدمن"
                dir="ltr"
                autoComplete="username"
                className="flex-1 bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
              <Lock size={14} className="text-txt3" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="كلمة المرور"
                dir="ltr"
                autoComplete="current-password"
                className="flex-1 bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="text-txt3 hover:text-txt"
                type="button"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            {error && <p className="text-[11.5px] text-rose">{error}</p>}

            <button
              onClick={submit}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-green/15 py-2.5 text-[13px] font-bold text-green hover:bg-green/25 disabled:opacity-50"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? "جاري الدخول…" : "دخول لوحة الأدمن"}
            </button>

            <a
              href="/#"
              className="block pt-1 text-center text-[11px] text-txt3 transition-colors hover:text-txt2"
            >
              ← رجوع للموقع الرئيسي
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}