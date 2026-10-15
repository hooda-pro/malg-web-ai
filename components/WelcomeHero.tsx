"use client";

import type { ReactNode } from "react";
import Logo from "./Logo";
import { useSettings } from "./SettingsContext";

export default function WelcomeHero({
  totalTokens,
  userName,
  onPromptSelected,
  composer,
}: {
  totalTokens: number;
  userName?: string | null;
  onPromptSelected?: (prompt: string) => void;
  /** خانة الكتابة في المنتصف (وضع الشات الجديد) — تُعرض بين الترحيب والاقتراحات */
  composer?: ReactNode;
}) {
  const { t, nickname } = useSettings();
  const name = (nickname || userName || "").trim().split(/\s+/)[0];
  // تحية زمنية بأسلوب كلود: الصباح/الظهيرة/المساء حسب توقيت المستخدم المحلي
  const dayPart = (() => {
    const h = new Date().getHours();
    if (h < 12) return "heroMorning";
    if (h < 18) return "heroAfternoon";
    return "heroEvening";
  })();

  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center px-5 pb-6 pt-10">
      <div className="stagger relative flex w-full max-w-[680px] flex-col items-center text-center">
        <h1 className="flex items-center justify-center gap-3 text-balance text-[clamp(28px,5.2vw,40px)] font-semibold leading-[1.1] tracking-display text-ink">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-accent">
            <Logo size={24} />
          </span>
          <span>{name ? t(dayPart, { name }) : t("heroTitle")}</span>
        </h1>
        <p className="mt-3 max-w-[46ch] text-pretty text-[15.5px] leading-7 text-ink-2">
          {t("heroSubtitle")}
        </p>

        {composer && <div className="mt-6 w-full">{composer}</div>}
      </div>
    </div>
  );
}
