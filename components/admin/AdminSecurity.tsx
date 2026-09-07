"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import type { SessionUser } from "@/lib/types";

/** قسم أمان حساب الأدمن — عرض بيانات الحساب وتغيير كلمة المرور */
export default function AdminSecurity({
  admin,
  notify,
}: {
  admin: SessionUser;
  notify: (type: "ok" | "err", text: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (newPassword.length < 8) {
      setError("كلمة المرور الجديدة لازم تكون 8 خانات على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("كلمة المرور الجديدة والتأكيد مش متطابقين");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "فشل تغيير كلمة المرور");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("ok", "تم تغيير كلمة مرور الأدمن بنجاح ✓");
    } catch {
      setError("مشكلة في الاتصال — حاول تاني");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* بيانات حساب الأدمن */}
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck size={15} className="text-green" />
          <h2 className="text-[13px] font-bold text-txt">حساب الأدمن</h2>
        </div>
        <div className="space-y-2 text-[12px]">
          <div className="flex items-center justify-between rounded-md border border-line bg-panel2 px-3 py-2">
            <span className="text-txt3">الاسم</span>
            <span className="text-txt">{admin.displayName}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-line bg-panel2 px-3 py-2">
            <span className="text-txt3">البريد الإلكتروني</span>
            <span className="mono text-txt" dir="ltr">
              {admin.email}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-line bg-panel2 px-3 py-2">
            <span className="text-txt3">الصلاحية</span>
            <span className="rounded bg-green/15 px-1.5 py-0.5 text-[10px] font-bold text-green">
              ADMIN — كل الصلاحيات
            </span>
          </div>
        </div>
      </div>

      {/* تغيير كلمة المرور */}
      <div className="rounded-lg border border-line bg-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound size={15} className="text-amber" />
          <h2 className="text-[13px] font-bold text-txt">تغيير كلمة المرور</h2>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
            <Lock size={14} className="shrink-0 text-txt3" />
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              type={show ? "text" : "password"}
              placeholder="كلمة المرور الحالية"
              dir="ltr"
              className="w-full bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
            <Lock size={14} className="shrink-0 text-txt3" />
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              type={show ? "text" : "password"}
              placeholder="كلمة المرور الجديدة (8 خانات على الأقل)"
              dir="ltr"
              className="w-full bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
            <Lock size={14} className="shrink-0 text-txt3" />
            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type={show ? "text" : "password"}
              placeholder="تأكيد كلمة المرور الجديدة"
              dir="ltr"
              className="w-full bg-transparent text-[12.5px] text-txt placeholder:text-txt3 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <button onClick={() => setShow(!show)} className="shrink-0 text-txt3 hover:text-txt">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {error && <p className="text-[11.5px] text-rose">{error}</p>}

          <button
            onClick={submit}
            disabled={loading || !currentPassword || !newPassword || !confirmPassword}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-amber/15 py-2.5 text-[12.5px] font-bold text-amber hover:bg-amber/25 disabled:opacity-40"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "جاري التغيير…" : "تغيير كلمة المرور"}
          </button>
        </div>
      </div>
    </div>
  );
}