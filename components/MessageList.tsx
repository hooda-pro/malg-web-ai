"use client";

import { useEffect, useRef, useState } from "react";
import { MonitorPlay, Sparkles } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type { ProjectFile } from "@/lib/parseContent";
import { extractProjectFiles, parseStreamingContent } from "@/lib/parseContent";
import MessageItem from "./MessageItem";
import WelcomeHero from "./WelcomeHero";
import { useSettings } from "./SettingsContext";

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
    <div className="flex-1 overflow-y-auto py-2">
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
        <div className="animate-slideUp [animation-fill-mode:both] flex w-full justify-start gap-2 px-2.5 py-1.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan/50 bg-purple/15">
            <Sparkles size={13} className="text-cyan animate-pulse" />
          </div>
          <div className="flex max-w-[88%] flex-col items-start">
            <div className="mb-1 flex items-center gap-1.5 px-0.5">
              <span className="mono text-[11px] font-bold text-cyan">mlag</span>
              <span className="flex gap-0.5">
                <span className="h-1 w-1 animate-pulse rounded-full bg-green" />
                <span className="h-1 w-1 animate-pulse rounded-full bg-green [animation-delay:150ms]" />
                <span className="h-1 w-1 animate-pulse rounded-full bg-green [animation-delay:300ms]" />
              </span>
            </div>
            {/* مؤشر «يفكر» — كلمة واحدة عارية من غير أي فقاعة أو نص حواليها.
                بيظهر فوراً بعد إرسال الرسالة حتى قبل ما reasoning يوصل. */}
            {(!streamingContent || streamingReasoning) && (
              <div className="mb-2">
                <button
                  onClick={() => setThinkOpen(!thinkOpen)}
                  className="flex items-center gap-1 rounded px-0.5"
                  title={thinkOpen ? t("thinkHide") : t("thinkShow")}
                >
                  <span
                    className={`mono text-[11px] font-bold text-amber transition-transform duration-200 ${
                      thinkOpen ? "rotate-90" : ""
                    }`}
                  >
                    {">"}
                  </span>
                  <span className="shimmer-text text-[11px] font-bold">{t("thinking")}</span>
                </button>
                {thinkOpen && (
                  <div
                    ref={thinkBoxRef}
                    className="reasoning-box animate-fadeIn mt-1.5 max-h-[180px] w-[320px] max-w-full overflow-y-auto rounded-md border border-line2 bg-panel3 px-2.5 py-2"
                  >
                    <p className="whitespace-pre-wrap text-[11px] leading-5 text-txt2">
                      {streamingReasoning || "..."}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* الفقاعة نفسها مبتظهرش خالص لحد ما يوصل كلام فعلي — مفيش فقاعة فاضية */}
            {(streamSegments.length > 0 || streamingContent) && (
              <div className="rounded-lg rounded-bl-sm border border-line2 bg-panel2 px-3 py-2">
                {streamSegments.map((seg, i) =>
                  seg.type === "prose" ? (
                    <p key={i} className="whitespace-pre-wrap text-[13.5px] leading-6 text-txt">
                      {seg.text}
                      {i === streamSegments.length - 1 && <span className="term-caret" />}
                    </p>
                  ) : (
                    <div
                      key={i}
                      className="my-1.5 flex items-center gap-2 rounded-md border border-cyan/30 bg-cyan/5 px-2.5 py-2"
                    >
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                      <span className="mono text-[11.5px] text-cyan" dir="ltr">
                        {seg.isComplete
                          ? t("fileDone", { path: seg.path })
                          : t("fileWriting", { path: seg.path })}
                      </span>
                    </div>
                  )
                )}
                {streamHasPreview && (
                  <button
                    onClick={() => onPreviewFiles(streamFiles)}
                    className="mt-2 flex items-center gap-1.5 rounded-md border border-cyan/50 bg-cyan/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan transition-colors hover:bg-cyan/15"
                  >
                    <MonitorPlay size={12} /> {t("previewPage")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
