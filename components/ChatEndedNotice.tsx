"use client";

import { MessageSquarePlus } from "lucide-react";
import { useSettings } from "./SettingsContext";

/**
 * بديل خانة الكتابة لما الموديل يقفل المحادثة (زي Claude): الخانة بتختفي خالص
 * وبيظهر إشعار هادي + زرار يبدأ محادثة جديدة. الرسايل القديمة تفضل مقروءة.
 */
export default function ChatEndedNotice({
  endedBy,
  onNewChat,
}: {
  endedBy?: "abuse" | "user" | null;
  onNewChat: () => void;
}) {
  const { t } = useSettings();
  return (
    <div className="relative shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
      <div
        role="status"
        className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-3 rounded-xl border border-hair bg-surface px-4 py-5 text-center shadow-2 sm:flex-row sm:text-start"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ink">{t("chatEndedTitle")}</p>
          <p className="mt-1 text-[12.5px] leading-6 text-ink-3">{t(endedBy === "user" ? "chatEndedBodyUser" : "chatEndedBody")}</p>
        </div>
        <button
          onClick={onNewChat}
          className="btn-sheen inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-accent-ink shadow-accent transition-all duration-1 ease-soft hover:bg-accent-hover active:scale-[0.97]"
        >
          <MessageSquarePlus size={15} />
          {t("chatEndedNew")}
        </button>
      </div>
    </div>
  );
}
