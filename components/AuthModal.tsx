"use client";

import { useState } from "react";
import { Sparkles, User } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { signInWithGoogle } from "@/lib/firebaseClient";
import { Button, Dialog, Field } from "./ui/Controls";
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
    <Dialog
      open
      onClose={pendingUser ? () => {} : onClose}
      labelledBy="mlag-auth-title"
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-accent-ink">
            <Sparkles size={15} />
          </span>
          {step === "google" ? t("authWelcomeTitle") : t("authProfileTitle")}
        </span>
      }
      subtitle={step === "google" ? t("authSubtitle") : t("authProfileHint")}
      footer={
        step === "google" ? (
          <Button
            variant="secondary"
            size="lg"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full gap-2.5"
          >
            <GoogleIcon />
            {loading ? t("working") : t("btnGoogle")}
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            onClick={submitProfile}
            disabled={loading}
            className="w-full"
          >
            {loading ? t("working") : t("btnContinue")}
          </Button>
        )
      }
    >
      <div className="space-y-4 pb-2">
        {step === "google" ? (
          <p className="text-pretty text-[12.5px] leading-6 text-ink-3">{t("authGoogleHint")}</p>
        ) : (
          <>
            <Field
              label={t("phName")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("phName")}
              autoComplete="name"
            />
            <Field
              label={t("phAge")}
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))}
              type="text"
              inputMode="numeric"
              dir="ltr"
              placeholder={t("phAge")}
              onKeyDown={(e) => e.key === "Enter" && submitProfile()}
            />
          </>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-md border border-hair bg-danger-soft px-3 py-2 text-[12.5px] leading-5 text-danger"
          >
            {error}
          </p>
        )}

        {step === "profile" && (
          <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <User size={12} className="shrink-0" />
            {pendingUser?.email}
          </p>
        )}
      </div>
    </Dialog>
  );
}
