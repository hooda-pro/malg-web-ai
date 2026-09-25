"use client";

import { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { LANGUAGES, type Lang } from "@/lib/i18n";
import { Button, Dialog, Panel, Segmented, Switch } from "./ui/Controls";
import { useSettings, type Theme } from "./SettingsContext";
import { cn } from "@/lib/utils";

export default function SettingsModal({
  user,
  onClose,
  onNameUpdated,
}: {
  user: SessionUser | null;
  onClose: () => void;
  onNameUpdated: (newName: string) => void;
}) {
  const { t, lang, theme, animations, showTime, setLang, setTheme, setAnimations, setShowTime } =
    useSettings();
  const [nameDraft, setNameDraft] = useState(user?.displayName ?? "");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [nameError, setNameError] = useState<string | null>(null);

  const saveName = async () => {
    if (!user) return;
    const newName = nameDraft.trim();
    if (!newName) {
      setNameError(t("errName"));
      return;
    }
    if (newName === user.displayName) {
      return;
    }
    setNameStatus("saving");
    setNameError(null);
    try {
      const res = await fetch("/api/auth/update-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNameError(data.error || t("errGeneric"));
        setNameStatus("idle");
        return;
      }
      setNameStatus("saved");
      onNameUpdated(data.user.displayName);
      setTimeout(() => setNameStatus("idle"), 2500);
    } catch {
      setNameError(t("errConn"));
      setNameStatus("idle");
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="mlag-settings-title"
      title={t("settingsTitle")}
      subtitle={t("settingsSaved")}
    >
      <div className="space-y-5 pb-4">
        {user && (
          <section>
            <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-micro text-ink-3">
              {t("settingsAccount")}
            </h3>
            <Panel>
              <div className="flex items-center gap-2 p-3">
                <input
                  value={nameDraft}
                  onChange={(e) => {
                    setNameDraft(e.target.value);
                    setNameStatus("idle");
                    setNameError(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                  placeholder={t("phName")}
                  maxLength={40}
                  aria-label={t("editName")}
                  className={cn(
                    "h-10 min-w-0 flex-1 rounded-md border border-hair bg-surface-2 px-3",
                    "text-[14px] text-ink placeholder:text-ink-3 transition-all duration-1",
                    "hover:border-hair-2 focus:border-accent focus:bg-surface focus:outline-none",
                    "focus:shadow-[0_0_0_3.5px_var(--accent-soft)]"
                  )}
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={saveName}
                  disabled={
                    nameStatus === "saving" ||
                    !nameDraft.trim() ||
                    nameDraft.trim() === user.displayName
                  }
                >
                  {nameStatus === "saving" ? (
                    <>
                      <RefreshCw size={12} className="animate-spin-slow" />
                      {t("saving")}
                    </>
                  ) : nameStatus === "saved" ? (
                    <>
                      <Check size={12} />
                      {t("nameSaved")}
                    </>
                  ) : (
                    t("save")
                  )}
                </Button>
              </div>
              {nameError && (
                <p role="alert" className="px-3 pb-3 text-[12px] text-danger">
                  {nameError}
                </p>
              )}
            </Panel>
          </section>
        )}

        <section>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-micro text-ink-3">
            {t("appearance")}
          </h3>
          <Panel>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[14px] text-ink">{t("themeLabel")}</span>
              <Segmented<Theme>
                value={theme}
                onChange={setTheme}
                size="sm"
                options={[
                  { value: "light", label: t("themeLight") },
                  { value: "dark", label: t("themeDark") },
                ]}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hair px-4 py-3">
              <span className="text-[14px] text-ink">{t("settingsLang")}</span>
              <div className="flex flex-wrap justify-end gap-1.5">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => setLang(l.code as Lang)}
                    aria-pressed={lang === l.code}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-all duration-1",
                      lang === l.code
                        ? "border-accent-line bg-accent-soft text-accent"
                        : "border-hair text-ink-2 hover:border-hair-2 hover:text-ink"
                    )}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </Panel>
        </section>

        <section>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-micro text-ink-3">
            {t("preferences")}
          </h3>
          <Panel>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[14px] text-ink">{t("settingsAnim")}</span>
              <Switch checked={animations} onChange={setAnimations} label={t("settingsAnim")} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-hair px-4 py-3">
              <span className="text-[14px] text-ink">{t("settingsShowTime")}</span>
              <Switch checked={showTime} onChange={setShowTime} label={t("settingsShowTime")} />
            </div>
          </Panel>
        </section>
      </div>
    </Dialog>
  );
}
