"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import type { SessionUser } from "@/lib/types";

/** شاشة دخول الأدمن — نفس ديزاين الشات (زجاج نظيف، لا ترمينال). */
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
    <div className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="w-full max-w-sm animate-materialize overflow-hidden rounded-lg border border-hair bg-surface shadow-2">
        <div className="flex flex-col items-center gap-2 border-b border-hair px-6 pb-5 pt-7 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-ink shadow-accent">
            <ShieldCheck size={20} />
          </span>
          <h1 className="mt-1 text-[17px] font-semibold tracking-title text-ink">
            لوحة تحكم mlag
          </h1>
          <p className="text-pretty text-[13px] leading-6 text-ink-2">
            سجّل دخول بحساب الأدمن للوصول إلى لوحة الإدارة
          </p>
        </div>

        <div className="px-6 py-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5 rounded-lg border border-hair bg-surface-2 px-3.5 py-2.5 transition-[border-color] duration-1 focus-within:!border-accent-line">
              <Mail size={15} className="shrink-0 text-ink-3" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="البريد الإلكتروني للأدمن"
                dir="ltr"
                autoComplete="username"
                className="w-full flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-3 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2.5 rounded-lg border border-hair bg-surface-2 px-3.5 py-2.5 transition-[border-color] duration-1 focus-within:!border-accent-line">
              <Lock size={15} className="shrink-0 text-ink-3" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="كلمة المرور"
                dir="ltr"
                autoComplete="current-password"
                className="w-full flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-ink-3 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="shrink-0 text-ink-3 transition-colors duration-1 hover:text-ink"
                type="button"
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2 text-[12.5px] leading-5 text-danger">
                {error}
              </p>
            )}

            <button
              onClick={submit}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-[13.5px] font-medium text-accent-ink shadow-accent transition-all duration-1 ease-soft hover:bg-accent-hover active:scale-[0.98] disabled:bg-surface-3 disabled:text-ink-3 disabled:shadow-none"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? "جاري الدخول…" : "دخول لوحة الأدمن"}
            </button>

            <a
              href="/#"
              className="block pt-1 text-center text-[12.5px] text-ink-3 transition-colors duration-1 hover:text-ink"
            >
              ← رجوع للموقع الرئيسي
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
