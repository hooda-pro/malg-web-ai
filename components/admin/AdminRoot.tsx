"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import AdminLogin from "./AdminLogin";
import AdminPanel from "./AdminPanel";

/**
 * بوابة لوحة الأدمن: بيتأكد من الجلسة الأول، ولو فيه أدمن مسجل يدخل
 * اللوحة على طول — غير كده يعرض شاشة تسجيل دخول الأدمن.
 */
export default function AdminRoot() {
  const [checking, setChecking] = useState(true);
  const [admin, setAdmin] = useState<SessionUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        const u = data?.user;
        if (u && u.isAdmin) setAdmin(u);
      } catch {
        // تجاهل — هيظهر شاشة الدخول
      }
      setChecking(false);
    })();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAdmin(null);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-ground">
        <Loader2 size={22} className="animate-spin text-accent" />
        <p className="text-[13px] text-ink-2">جاري التحقق من الصلاحيات…</p>
      </div>
    );
  }

  if (!admin) return <AdminLogin onLogin={setAdmin} />;

  return <AdminPanel admin={admin} onLogout={handleLogout} />;
}