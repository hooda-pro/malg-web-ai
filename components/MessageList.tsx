"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { parseStreamingContent } from "@/lib/parseContent";
import MessageItem from "./MessageItem";
import WelcomeHero from "./WelcomeHero";

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
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamingContent, continuationStreamingContent]);

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
        />
      ))}

      {isGenerating && (
        <div className="flex w-full justify-start gap-2 px-2.5 py-1.5">
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
            <div className="rounded-lg rounded-bl-sm border border-line2 bg-panel2 px-3 py-2">
              {streamingReasoning && (
                <div className="mb-2 rounded-md border border-line2 bg-panel3 px-2.5 py-2">
                  <p className="text-[11px] font-bold text-amber">بيفكّر...</p>
                  <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-5 text-txt2">
                    {streamingReasoning}
                  </p>
                </div>
              )}
              {streamSegments.length === 0 && !streamingContent && (
                <p className="term-caret text-[13.5px] text-txt2"></p>
              )}
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
                      {seg.isComplete ? "تم إنشاء الملف: " : "جاري كتابة الملف: "}
                      {seg.path}
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
