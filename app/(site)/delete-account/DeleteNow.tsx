"use client";

import { useEffect, useState } from "react";

/**
 * حذف الحساب نهائيًا من الويب — نفس نقطة الـ API اللي يستخدمها التطبيق
 * (DELETE /api/auth/account): بيمسح الحساب بكل بياناته فورًا ويوقف الجلسة.
 */
export default function DeleteNow() {
  const [state, setState] = useState<"loading" | "guest" | "ready" | "busy" | "done" | "error">("loading");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!alive) return;
        if (res.ok && j?.user?.email) {
          setEmail(String(j.user.email));
          setState("ready");
        } else {
          setState("guest");
        }
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function deleteAccount() {
    if (state !== "ready" || !confirm) return;
    setState("busy");
    try {
      const res = await fetch("/api/auth/account", { method: "DELETE" });
      if (res.ok) {
        setState("done");
        return;
      }
      const j = await res.json().catch(() => null);
      setError(String(j?.error || `حدثت مشكلة (${res.status})`));
      setState("error");
    } catch {
      setError("تعذر الاتصال بالخادم — أعد المحاولة");
      setState("error");
    }
  }

  if (state === "loading") {
    return <p className="opacity-60">جارٍ التحميل…</p>;
  }

  if (state === "done") {
    return (
      <div className="mt-2 rounded-2xl border border-hair bg-surface-2 p-5">
        <p className="font-semibold text-ink">تم حذف الحساب نهائيًا ✓</p>
        <p className="mt-1 text-[13.5px] opacity-70">
          تم مسح الحساب وكل بياناته (المحادثات والرصيد والذاكرة) مع إنهاء
          الجلسة. لو حابب تبدأ من جديد سجّل حساب جديد من الصفحة الرئيسية.
        </p>
        <a
          href="/"
          className="mt-3 inline-flex items-center gap-2 rounded-full border border-hair px-4 py-2 text-[13.5px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
        >
          العودة للرئيسية
        </a>
      </div>
    );
  }

  if (state === "guest") {
    return (
      <div className="mt-2 rounded-2xl border border-hair bg-surface-2 p-5">
        <p>
          لازم تسجّل الدخول بنفس الحساب اللي عايز تحذفه الأول.{" "}
          <a href="/" className="font-medium text-ink underline">
            افتح الصفحة الرئيسية وسجّل الدخول
          </a>{" "}
          ثم ارجع لهنا.
        </p>
      </div>
    );
  }

  if (state === "error" && !email) {
    return (
      <div className="mt-2 rounded-2xl border border-hair bg-surface-2 p-5">
        <p className="text-danger">{error || "تعذر التحقق من الجلسة"}</p>
        <button
          onClick={() => setState("loading")}
          className="mt-2 rounded-full border border-hair px-4 py-2 text-[13.5px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-danger/40 bg-surface-2 p-5">
      <p>
        الحساب: <span className="font-semibold text-ink">{email}</span>
      </p>
      <label className="mt-3 flex items-start gap-2.5 text-[13.5px]">
        <input
          type="checkbox"
          checked={confirm}
          onChange={(e) => setConfirm(e.target.checked)}
          className="mt-1 size-4 shrink-0 accent-danger"
        />
        <span>
          أفهم أن الحذف <strong>نهائي</strong> — المحادثات والرصيد والذاكرة
          ومعلومات الحساب كلها هتُمسح ولا يمكن استرجاعها.
        </span>
      </label>
      {state === "error" && email ? (
        <p className="mt-3 text-[13.5px] text-danger">{error}</p>
      ) : null}
      <button
        disabled={!confirm || state === "busy"}
        onClick={deleteAccount}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-danger px-5 py-2.5 text-[14px] font-medium text-white transition-[filter] duration-1 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state === "busy" ? "جارٍ الحذف…" : "حذف الحساب نهائيًا"}
      </button>
      <p className="mt-2 text-[12.5px] opacity-60">
        لو حابب مهلة 30 يومًا بدلًا من الحذف الفوري، استخدم «حذف الحساب» من
        إعدادات الموقع أو التطبيق.
      </p>
    </div>
  );
}
