"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { Button, Dialog, Field, Segmented } from "./ui/Controls";
import { useSettings } from "./SettingsContext";

export default function AuthModal({
  onClose,
  onAuthenticated,
}: {
  onClose: () => void;
  onAuthenticated: (user: SessionUser) => void;
}) {
  const { t } = useSettings();
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
      setError(t("errEmailPass"));
      return;
    }
    if (tab === "register" && !name.trim()) {
      setError(t("errName"));
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
      onClose={onClose}
      labelledBy="mlag-auth-title"
      title={
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-accent-ink">
            <Sparkles size={15} />
          </span>
          {tab === "login" ? t("authLoginTitle") : t("authRegisterTitle")}
        </span>
      }
      subtitle={t("authSubtitle")}
      footer={
        <Button
          variant="primary"
          size="lg"
          onClick={submit}
          disabled={loading}
          className="w-full"
        >
          {loading ? t("working") : tab === "login" ? t("btnLogin") : t("btnRegister")}
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        <Segmented
          className="w-full [&>button]:flex-1"
          value={tab}
          onChange={(v) => {
            setTab(v);
            setError(null);
          }}
          options={[
            { value: "login", label: t("tabLogin") },
            { value: "register", label: t("tabRegister") },
          ]}
        />

        {tab === "register" && (
          <Field
            label={t("phName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("phName")}
            autoComplete="name"
          />
        )}

        <Field
          label={t("phEmail")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          dir="ltr"
          autoComplete="email"
        />

        <div>
          <Field
            label={t("phPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            type={showPassword ? "text" : "password"}
            dir="ltr"
            autoComplete={tab === "login" ? "current-password" : "new-password"}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          <button
            onClick={() => setShowPassword(!showPassword)}
            className="mt-1.5 text-[12px] font-medium text-accent transition-opacity duration-1 hover:opacity-70"
          >
            {showPassword ? t("hidePassword") : t("showPassword")}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-hair bg-danger-soft px-3 py-2 text-[12.5px] leading-5 text-danger"
          >
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
