"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, Eye, Sparkles } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type { ProjectFile } from "@/lib/parseContent";
import { extractProjectFiles, parseStreamingContent } from "@/lib/parseContent";
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
  onPromptSelected,
  onOpenRunner,
  onRunCode,
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
  onPromptSelected: (prompt: string) => void;
  onOpenRunner: () => void;
  onRunCode: (code: string, language: string) => void;
  onContinue: (messageId: string) => void;
  continuingMessageId: string | null;
  continuationStreamingContent: string;
  onPreviewFiles: (files: ProjectFile[]) => void;
}) {
  const { t } = useSettings();
  const bottomRef = useRef<HTMLDivElement>(null);
  const thinkBoxRef = useRef<HTMLDivElement>(null);
  const [thinkOpen, setThinkOpen] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamingContent, continuationStreamingContent]);

  // لو بوكس التفكير الصغير مفتوح، انزل تلقائياً مع آخر سطر تفكير
  useEffect(() => {
    if (thinkOpen && thinkBoxRef.current) {
      thinkBoxRef.current.scrollTop = thinkBoxRef.current.scrollHeight;
    }
  }, [streamingReasoning, thinkOpen]);

  if (messages.length === 0 && !isGenerating) {
    return (
      <WelcomeHero
        totalTokens={totalTokens}
        onPromptSelected={onPromptSelected}
        onOpenRunner={onOpenRunner}
      />
    );
  }

  const streamSegments = isGenerating ? parseStreamingContent(streamingContent) : [];
  const streamFiles = isGenerating ? extractProjectFiles(streamingContent) : [];
  const streamHasPreview = streamFiles.some((f) =>
    PREVIEWABLE_EXTS.has((f.path.split(".").pop() || "").toLowerCase())
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[820px] pb-2">
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            onRunCode={onRunCode}
            onContinue={() => onContinue(m.id)}
            isContinuing={continuingMessageId === m.id}
            continuationStreamingContent={
              continuingMessageId === m.id ? continuationStreamingContent : null
            }
            onPreviewFiles={onPreviewFiles}
          />
        ))}

        {isGenerating && (
          <article className="animate-rise w-full px-4 py-4 sm:px-6">
            <div className="flex gap-3">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent">
                <Sparkles size={14} />
              </span>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold tracking-label text-ink">mlag</span>
                  <button
                    onClick={() => setThinkOpen(!thinkOpen)}
                    aria-expanded={thinkOpen}
                    title={thinkOpen ? t("thinkHide") : t("thinkShow")}
                    className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12.5px] font-medium text-ink-3 transition-colors duration-1 hover:text-ink"
                  >
                    <ChevronRight
                      size={12}
                      className={cn(
                        "transition-transform duration-2 ease-soft",
                        thinkOpen && "rotate-90"
                      )}
                    />
                    <span className="shimmer-text">{t("thinking")}</span>
                  </button>
                </div>

                {thinkOpen && (
                  <div
                    ref={thinkBoxRef}
                    className="animate-materialize mb-3 max-h-[200px] overflow-y-auto rounded-md border border-hair bg-surface-2 px-3.5 py-3"
                  >
                    <p
                      dir="auto"
                      className="whitespace-pre-wrap text-[12.5px] leading-6 text-ink-2"
                    >
                      {streamingReasoning || "..."}
                    </p>
                  </div>
                )}

                <div className="measure space-y-2">
                  {streamSegments.map((seg, i) =>
                    seg.type === "prose" ? (
                      <p
                        key={i}
                        dir="auto"
                        className={cn(
                          "whitespace-pre-wrap text-pretty text-[15px] leading-7 text-ink",
                          i === streamSegments.length - 1 && "caret"
                        )}
                      >
                        {seg.text}
                      </p>
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
                        <span dir="ltr" className="truncate text-[12.5px] text-ink-2">
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
