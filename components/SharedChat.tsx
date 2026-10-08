"use client";

import { useEffect, useState } from "react";
import Logo from "./Logo";
import CodeBlock from "./CodeBlock";
import { parseMessageContent } from "@/lib/parseContent";
import { renderFormattedText } from "@/lib/markdown";
import { useSettings } from "./SettingsContext";
import { formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface SharedMessage {
  role: string;
  content: string;
  createdAt: string;
}

/**
 * صفحة المحادثة المشاركة برابط — للقراءة فقط وبدون تسجيل دخول.
 * تعرض النص المرئي فقط (السيرفر يشيل التفكير الداخلي والتوكنز والبيانات).
 */
export default function SharedChat({ token }: { token: string }) {
  const { t, showTime } = useSettings();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [messages, setMessages] = useState<SharedMessage[]>([]);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/shared/${encodeURIComponent(token)}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !Array.isArray(data.messages)) {
          setMissing(true);
          return;
        }
        setTitle(String(data.title || ""));
        setMessages(data.messages);
      } catch {
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-ground">
      <header className="glass sticky top-0 z-nav flex h-14 shrink-0 items-center justify-between border-b border-hair px-4 sm:px-6">
        <span className="flex items-center gap-2.5" aria-label="MALG AI">
          <span className="grid h-7 w-7 place-items-center text-ink">
            <Logo size={25} />
          </span>
          <span className="text-[15px] font-semibold tracking-title text-ink">MALG AI</span>
        </span>
        <a
          href="/"
          className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[13.5px] font-medium text-accent-ink transition-colors duration-1 hover:bg-accent-hover"
        >
          {t("sharedOpenApp")}
        </a>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[820px] px-4 pb-10 pt-6 sm:px-6">
          {loading ? (
            <div className="space-y-8 py-6" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex animate-pulse gap-3">
                  <span className="h-7 w-7 shrink-0 rounded-[9px] bg-surface-3" />
                  <div className="min-w-0 flex-1 space-y-2.5 pt-1.5">
                    <span className="block h-3 w-[72%] rounded-full bg-surface-3" />
                    <span className="block h-3 w-[48%] rounded-full bg-surface-3" />
                  </div>
                </div>
              ))}
            </div>
          ) : missing ? (
            <div className="py-24 text-center">
              <p className="text-[15px] font-medium text-ink">{t("sharedNotFound")}</p>
              <a
                href="/"
                className="mt-4 inline-flex h-10 items-center rounded-full bg-accent px-5 text-[14px] font-medium text-accent-ink hover:bg-accent-hover"
              >
                {t("sharedOpenApp")}
              </a>
            </div>
          ) : (
            <>
              {title && (
                <h1 dir="auto" className="mb-6 text-balance text-[22px] font-semibold tracking-title text-ink">
                  {title}
                </h1>
              )}
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex w-full flex-col items-end py-3">
                    <div
                      className="msg-in max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-ee-xs border border-hair bg-surface-3 px-4 py-2.5 text-[15px] leading-7 text-ink shadow-1"
                      dir="auto"
                    >
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <article key={i} className="msg-in w-full py-4">
                    <div className="mb-1 flex items-center gap-x-2">
                      <span className="text-[12px] font-medium tracking-label text-ink-3">MALG</span>
                      {showTime && m.createdAt && (
                        <span className="tnum text-[11.5px] text-ink-3">{formatTime(m.createdAt)}</span>
                      )}
                    </div>
                    <div className="measure flex flex-col gap-3" dir="auto">
                      {parseMessageContent(m.content).map((seg, j) =>
                        seg.type === "text" ? (
                          seg.text.trim() ? (
                            <div key={j} className={cn(j === 0 && i === 0 && "animate-rise")}>
                              {renderFormattedText(seg.text.trim(), `shared-${i}-${j}`)}
                            </div>
                          ) : null
                        ) : (
                          // العرض العام: كل الكود inline (حتى التسليم) — بلا كروت تفاعلية
                          <CodeBlock key={j} language={seg.language} code={seg.code} />
                        )
                      )}
                    </div>
                  </article>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
