"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Lightbulb,
  Play,
  Sparkles,
  User,
} from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { extractProjectFiles, parseMessageContent } from "@/lib/parseContent";
import { formatTime } from "@/lib/utils";
import CodeBlock from "./CodeBlock";
import ProjectFilesCard from "./ProjectFilesCard";

export default function MessageItem({
  message,
  onRunCode,
  onContinue,
  isContinuing,
  continuationStreamingContent,
}: {
  message: ChatMessage;
  onRunCode: (code: string, language: string) => void;
  onContinue: () => void;
  isContinuing: boolean;
  continuationStreamingContent: string | null;
}) {
  const isUser = message.role === "user";
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayContent = message.content + (continuationStreamingContent || "");
  const projectFiles = useMemo(() => extractProjectFiles(displayContent), [displayContent]);
  const hasProjectFiles = !isUser && projectFiles.length > 0;
  const segments = useMemo(() => parseMessageContent(displayContent), [displayContent]);

  const thinkingLabel = useMemo(() => {
    const secs = (message.thinkingDurationMs ?? 0) / 1000;
    return secs >= 1 ? `فكّر لمدة ${Math.round(secs)}ث` : "التفكير";
  }, [message.thinkingDurationMs]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // تجاهل
    }
  };

  return (
    <div className={`flex w-full gap-2 px-2.5 py-1.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan/50 bg-purple/15">
          <Sparkles size={13} className="text-cyan" />
        </div>
      )}

      <div className={`flex max-w-[88%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        {!isUser && (
          <div className="mb-1 flex items-center gap-1.5 px-0.5">
            <span className="mono text-[11px] font-bold text-cyan">mlag</span>
            <span className="rounded bg-panel3 px-1 py-[1px] text-[9px] text-txt2">AI Model</span>
            {message.tokensUsed > 0 && (
              <span className="text-[9px] text-green">⚡ {message.tokensUsed} tokens</span>
            )}
            <span className="text-[9px] text-txt3">{formatTime(message.createdAt)}</span>
          </div>
        )}

        <div
          className={`rounded-lg border px-3 py-2 ${
            isUser
              ? "rounded-tl-lg rounded-bl-lg rounded-br-sm border-cyan/40 bg-[#0c1a17]"
              : "rounded-tr-lg rounded-br-lg rounded-bl-sm border-line2 bg-panel2"
          }`}
        >
          {!isUser && message.reasoning && (
            <button
              onClick={() => setReasoningOpen(!reasoningOpen)}
              className="mb-2 w-full rounded-md border border-line2 bg-panel3 px-2.5 py-2 text-right"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Lightbulb size={13} className="text-amber" />
                  <span className="text-[11px] font-bold text-amber">{thinkingLabel}</span>
                </div>
                {reasoningOpen ? (
                  <ChevronUp size={14} className="text-txt3" />
                ) : (
                  <ChevronDown size={14} className="text-txt3" />
                )}
              </div>
              {reasoningOpen && (
                <p className="mt-2 whitespace-pre-wrap text-[11.5px] leading-5 text-txt2">
                  {message.reasoning}
                </p>
              )}
            </button>
          )}

          {hasProjectFiles && (
            <div className="mb-2">
              <ProjectFilesCard messageId={message.id} files={projectFiles} onRunCode={onRunCode} />
            </div>
          )}

          {segments.map((seg, i) =>
            seg.type === "text" ? (
              <p
                key={i}
                className="whitespace-pre-wrap text-[13.5px] leading-6 text-txt"
              >
                {seg.text.trim()}
              </p>
            ) : hasProjectFiles ? null : (
              <CodeBlock key={i} language={seg.language} code={seg.code} onRun={onRunCode} />
            )
          )}

          {!isUser && (message.isTruncated || isContinuing) && (
            <div className="mt-2">
              {isContinuing ? (
                <div className="flex items-center gap-2 text-[11.5px] text-txt2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                  جاري المتابعة...
                </div>
              ) : (
                <button
                  onClick={onContinue}
                  className="flex items-center gap-1.5 rounded-md border border-cyan/50 bg-cyan/10 px-3 py-1.5 text-[11.5px] font-medium text-cyan hover:bg-cyan/15"
                >
                  <Play size={13} /> الرد اتقطع — دوس عشان يكمل
                </button>
              )}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between">
            {isUser ? (
              <span className="text-[10px] text-txt3">{formatTime(message.createdAt)}</span>
            ) : (
              <span />
            )}
            <button onClick={handleCopy} className="text-txt3 hover:text-txt">
              {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      </div>

      {isUser && (
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line2 bg-panel3">
          <User size={12} className="text-txt2" />
        </div>
      )}
    </div>
  );
}
