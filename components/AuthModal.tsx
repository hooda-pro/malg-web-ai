"use client";

import { useState } from "react";
import { Terminal, User, X } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { signInWithGoogle } from "@/lib/firebaseClient";
import { useSettings } from "./SettingsContext";

/** أيقونة جوجل الرسمية (SVG بألوانها الأصلية) */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.4-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34 5.1 29.3 3 24 3 16.3 3 9.7 7.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.4-4.6 2.3-7.2 2.3-5.3 0-9.7-3.4-11.3-8.1l-6.5 5C9.6 40.6 16.3 45 24 45z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36 44 30.6 44 24c0-1.4-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export default function AuthModal({
  onClose,
  onAuthenticated,
  pendingUser,
}: {
  onClose: () => void;
  onAuthenticated: (user: SessionUser) => void;
  /** لو موجود، معناه المستخدم عامل تسجيل دخول بجوجل خلاص وناقصه بس يكمل بياناته */
  pendingUser?: SessionUser | null;
}) {
  const { t } = useSettings();
  const [step, setStep] = useState<"google" | "profile">(pendingUser ? "profile" : "google");
  const [name, setName] = useState(pendingUser?.displayName || "");
  const [age, setAge] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const idToken = await signInWithGoogle();
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("errGeneric"));
        return;
      }
      if (data.needsProfile) {
        setName(data.user.displayName || "");
        setStep("profile");
      } else {
        onAuthenticated(data.user);
      }
    } catch {
      setError(t("errGoogle"));
    } finally {
      setLoading(false);
    }
  };

  const submitProfile = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t("errName"));
      return;
    }
    const ageNum = Number(age);
    if (!age || !Number.isInteger(ageNum) || ageNum < 8 || ageNum > 120) {
      setError(t("errAge"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/complete-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, age: ageNum }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("errGeneric"));
        return;
      }
      onAuthenticated(data.user);
    } catch {
      setError(t("errConn"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-lg border border-line2 bg-panel glow-green">
        <div className="terminal-dots flex items-center justify-between border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-rose/70" />
              <span className="h-2 w-2 rounded-full bg-amber/70" />
              <span className="h-2 w-2 rounded-full bg-green/70" />
            </span>
            <span className="mono text-[11px] text-txt3">auth.sh</span>
          </div>
          {!pendingUser && (
            <button onClick={onClose} className="text-txt3 hover:text-txt">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="px-5 py-5">
          <div className="mb-4 flex items-center justify-center gap-2">
            <Terminal size={18} className="text-green" />
            <h2 className="mono text-sm font-bold text-txt">
              {step === "google" ? t("authWelcomeTitle") : t("authProfileTitle")}
            </h2>
          </div>

          {step === "google" ? (
            <div className="space-y-2.5">
              <button
                onClick={handleGoogle}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2.5 rounded-md border border-line2 bg-panel2 py-2.5 text-[13px] font-bold text-txt hover:bg-white/5 disabled:opacity-50"
              >
                <GoogleIcon />
                {loading ? t("working") : t("btnGoogle")}
              </button>
              {error && <p className="text-[11.5px] text-rose">{error}</p>}
              <p className="pt-1 text-center text-[11px] leading-relaxed text-txt3">
                {t("authGoogleHint")}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="mb-1 text-center text-[11.5px] text-txt3">{t("authProfileHint")}</p>
              <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
                <User size={14} className="text-txt3" />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("phName")}
                  className="flex-1 bg-transparent text-base text-txt placeholder:text-txt3 focus:outline-none sm:text-[12.5px]"
                />
              </div>
              <div className="flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
                <span className="mono text-[13px] text-txt3">#</span>
                <input
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))}
                  type="text"
                  inputMode="numeric"
                  placeholder={t("phAge")}
                  dir="ltr"
                  className="flex-1 bg-transparent text-base text-txt placeholder:text-txt3 focus:outline-none sm:text-[12.5px]"
                  onKeyDown={(e) => e.key === "Enter" && submitProfile()}
                />
              </div>

              {error && <p className="text-[11.5px] text-rose">{error}</p>}

              <button
                onClick={submitProfile}
                disabled={loading}
                className="w-full rounded-md bg-green/15 py-2.5 text-[13px] font-bold text-green hover:bg-green/25 disabled:opacity-50"
              >
                {loading ? t("working") : t("btnContinue")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
