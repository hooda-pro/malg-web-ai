"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { useSettings } from "./SettingsContext";

/**
 * بديل خانة الكتابة لما رصيد التوكنز يخلص: الخانة بتختفي خالص، ويظهر كلام اشتراك/شحن
 * وزرار «شحن رصيد». الشات بيتفتح لوحده أول ما يبقى فيه توكنز (شحن من الدعم أو تجديد تلقائي).
 */
export default function QuotaExhaustedNotice({
  renewsAt,
  onRecharge,
}: {
  renewsAt: string | null;
  onRecharge: () => void;
}) {
  const { t } = useSettings();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!renewsAt) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [renewsAt]);

  let timeText: string | null = null;
  if (renewsAt) {
    const ms = new Date(renewsAt).getTime() - now;
    if (ms > 0) {
      const totalMin = Math.max(1, Math.ceil(ms / 60_000));
      const d = Math.floor(totalMin / 1440);
      const h = Math.floor((totalMin % 1440) / 60);
      const m = totalMin % 60;
      timeText =
        d > 0
          ? t("quotaOutTimeDH", { d, h })
          : h > 0
            ? t("quotaOutTimeHM", { h, m })
            : t("quotaOutTimeM", { m: totalMin });
    }
  }

  return (
    <div className="relative shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      <div
        role="status"
        className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-3 rounded-xl border border-hair bg-surface px-4 py-5 text-center shadow-2 sm:flex-row sm:text-start"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">{t("quotaOutTitle")}</p>
          <p className="mt-1 text-[12.5px] leading-6 text-ink-3">{t("quotaOutBody")}</p>
          {timeText && (
            <p className="tnum mt-1 text-[12px] leading-6 text-ink-3">{t("quotaOutRenew", { time: timeText })}</p>
          )}
        </div>
        <button
          onClick={onRecharge}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-accent-ink shadow-accent transition-all duration-1 ease-soft hover:bg-accent-hover active:scale-[0.97]"
        >
          <Zap size={15} />
          {t("quotaOutButton")}
        </button>
      </div>
    </div>
  );
}
