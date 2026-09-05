"use client";

import { Check, Settings as SettingsIcon, X } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { LANGUAGES, type Lang } from "@/lib/i18n";
import { useSettings } from "./SettingsContext";

function Toggle({ on, onToggle }: { on: boolean; onToggle: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onToggle(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        on ? "bg-green/40" : "border border-line2 bg-panel3"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
          on ? "start-0.5 bg-green" : "end-0.5 bg-txt3"
        }`}
      />
    </button>
  );
}

export default function SettingsModal({
  user,
  onClose,
}: {
  user: SessionUser | null;
  onClose: () => void;
}) {
  const { t, lang, animations, showTime, setLang, setAnimations, setShowTime } = useSettings();

  return (
    <div className="animate-fadeIn fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-line2 bg-panel glow-green">
        <div className="terminal-dots flex items-center justify-between border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-rose/70" />
              <span className="h-2 w-2 rounded-full bg-amber/70" />
              <span className="h-2 w-2 rounded-full bg-green/70" />
            </span>
            <span className="mono text-[11px] text-txt3">settings.sh</span>
          </div>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4">
          {/* الحساب */}
          {user && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-line2 bg-panel2 px-2.5 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-green/40 bg-green/10">
                <span className="mono text-[12px] text-green">{user.displayName[0]?.toUpperCase()}</span>
              </div>
              <div className="min-w-0 overflow-hidden">
                <p className="truncate text-[12.5px] font-medium text-txt">{user.displayName}</p>
                <p className="truncate text-[10.5px] text-txt3">{user.email}</p>
              </div>
              <SettingsIcon size={14} className="shrink-0 text-txt3" />
            </div>
          )}

          {/* اللغة */}
          <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold text-txt2">
            {t("settingsLang")}
          </p>
          <div className="mb-4 grid grid-cols-2 gap-2">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLang(l.code as Lang)}
                className={`flex items-center justify-between rounded-md border px-2.5 py-2 text-[12.5px] transition-colors ${
                  lang === l.code
                    ? "border-green/50 bg-green/10 font-bold text-green"
                    : "border-line2 text-txt2 hover:border-line2 hover:bg-white/[0.03] hover:text-txt"
                }`}
              >
                {l.label}
                {lang === l.code && <Check size={13} />}
              </button>
            ))}
          </div>

          {/* تخصيصات */}
          <p className="mb-2 text-[11.5px] font-bold text-txt2">{t("settingsTitle")}</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-line2 bg-panel2 px-2.5 py-2">
              <span className="text-[12px] text-txt">{t("settingsAnim")}</span>
              <Toggle on={animations} onToggle={setAnimations} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-line2 bg-panel2 px-2.5 py-2">
              <span className="text-[12px] text-txt">{t("settingsShowTime")}</span>
              <Toggle on={showTime} onToggle={setShowTime} />
            </div>
          </div>

          <p className="mt-4 text-center text-[10px] text-txt3">{t("settingsSaved")}</p>
        </div>
      </div>
    </div>
  );
}