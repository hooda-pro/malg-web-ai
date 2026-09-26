"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Eye, Sparkles } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type { ProjectFile } from "@/lib/parseContent";
import { extractProjectFiles, parseStreamingContent } from "@/lib/parseContent";
import { renderFormattedText } from "@/lib/markdown";
import MessageItem from "./MessageItem";
import WelcomeHero from "./WelcomeHero";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

const PREVIEWABLE_EXTS = new Set(["html", "htm", "css", "js"]);

export default function MessageList({
  messages,
  isGenerating,
  streamingContent,
  streamingReasoning,
  totalTokens,
  userName,
  onPromptSelected,
  onContinue,
  continuingMessageId,
  continuationStreamingContent,
  onPreviewFiles,
}: {
  messages: ChatMessage[];
  isGenerating: boolean;
  streamingContent: string;
  streamingReasoning: string;
  totalTokens: number;
  userName?: string | null;
  onPromptSelected: (prompt: string) => void;
  onContinue: (messageId: string) => void;
  continuingMessageId: string | null;
  continuationStreamingContent: string;
  onPreviewFiles: (files: ProjectFile[], focusPath?: string) => void;
}) {
  const { t } = useSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const thinkBoxRef = useRef<HTMLDivElement>(null);
  const [thinkOpen, setThinkOpen] = useState(false);
  const stickToBottom = useRef(true);

  // المستخدم لو طلع لفوق يقرا، ما نسحبهوش لتحت مع كل توكن جديد
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    stickToBottom.current = true;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!stickToBottom.current) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [streamingContent, continuationStreamingContent]);

  useEffect(() => {
    if (thinkOpen && thinkBoxRef.current) {
      thinkBoxRef.current.scrollTop = thinkBoxRef.current.scrollHeight;
    }
  }, [streamingReasoning, thinkOpen]);

  if (messages.length === 0 && !isGenerating) {
    return (
      <WelcomeHero
        totalTokens={totalTokens}
        userName={userName}
        onPromptSelected={onPromptSelected}
      />
    );
  }

  const streamSegments = isGenerating ? parseStreamingContent(streamingContent) : [];
  const streamFiles = isGenerating ? extractProjectFiles(streamingContent) : [];
  const streamHasPreview = streamFiles.some((f) =>
    PREVIEWABLE_EXTS.has((f.path.split(".").pop() || "").toLowerCase())
  );
  const isBuilding = streamSegments.some((s) => s.type === "fileblock");
  const showThinking = !streamingContent || !!streamingReasoning;

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[820px] pb-4 pt-2">
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            onContinue={() => onContinue(m.id)}
            isContinuing={continuingMessageId === m.id}
            continuationStreamingContent={
              continuingMessageId === m.id ? continuationStreamingContent : null
            }
            onPreviewFiles={onPreviewFiles}
          />
        ))}

        {isGenerating && (
          <article className="animate-rise w-full px-4 py-4 sm:px-6" aria-live="polite" aria-busy="true">
            <div className="flex gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent">
                <Sparkles size={14} className="pulse-dot" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold tracking-label text-ink">mlag</span>
                  {showThinking && (
                    <button
                      onClick={() => setThinkOpen(!thinkOpen)}
                      aria-expanded={thinkOpen}
                      title={thinkOpen ? t("thinkHide") : t("thinkShow")}
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12.5px] font-medium text-ink-3 transition-colors duration-1 hover:text-ink"
                    >
                      <ChevronRight
                        size={12}
                        className={cn(
                          "flip-rtl transition-transform duration-2 ease-soft",
                          thinkOpen && "rotate-90"
                        )}
                      />
                      <span className="shimmer-text">{t("thinking")}</span>
                    </button>
                  )}
                </div>

                {thinkOpen && showThinking && (
                  <div
                    ref={thinkBoxRef}
                    className="animate-materialize mb-3 max-h-[200px] overflow-y-auto rounded-md border border-hair bg-surface-2 px-3.5 py-3"
                  >
                    <div dir="auto" className="[&_p]:text-[13px] [&_p]:leading-6 [&_p]:text-ink-2">
                      {streamingReasoning
                        ? renderFormattedText(streamingReasoning, "stream-reasoning")
                        : <p>...</p>}
                    </div>
                  </div>
                )}

                {isBuilding && (
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-hair bg-surface px-3 py-1.5 shadow-1">
                    <span className="h-2 w-2 rounded-full bg-live pulse-dot" />
                    <span className="shimmer-text text-[12.5px] font-medium">{t("buildingLive")}</span>
                  </div>
                )}

                <div className="measure flex flex-col gap-3" dir="auto">
                  {streamSegments.map((seg, i) =>
                    seg.type === "prose" ? (
                      <div
                        key={i}
                        className={cn(i === streamSegments.length - 1 && "caret-last")}
                      >
                        {renderFormattedText(seg.text, `stream-${i}`)}
                      </div>
                    ) : (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 rounded-md border border-hair bg-surface-2 px-3.5 py-2.5"
                      >
                        <span
                          className={cn(
                            "h-2.5 w-2.5 shrink-0 rounded-full border-2",
                            seg.isComplete
                              ? "border-live bg-live/20"
                              : "animate-spin-slow border-accent border-t-transparent"
                          )}
                        />
                        <span dir="ltr" className="truncate font-mono text-[12.5px] text-ink-2">
                          {seg.isComplete
                            ? t("fileDone", { path: seg.path })
                            : t("fileWriting", { path: seg.path })}
                        </span>
                      </div>
                    )
                  )}
                </div>

                {streamHasPreview && (
                  <div className="mt-3">
                    <button
                      onClick={() => onPreviewFiles(streamFiles)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors duration-1 hover:bg-accent hover:text-accent-ink"
                    >
                      <Eye size={13} />
                      {t("previewPage")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </article>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
