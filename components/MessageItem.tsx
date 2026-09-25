"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Eye, Play, Sparkles, Zap } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type { ProjectFile } from "@/lib/parseContent";
import { extractProjectFiles, parseMessageContent } from "@/lib/parseContent";
import { formatTime } from "@/lib/utils";
import CodeBlock from "./CodeBlock";
import ProjectFilesCard from "./ProjectFilesCard";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

const PREVIEWABLE_EXTS = new Set(["html", "htm", "css", "js"]);

export default function MessageItem({
  message,
  onRunCode,
  onContinue,
  isContinuing,
  continuationStreamingContent,
  onPreviewFiles,
}: {
  message: ChatMessage;
  onRunCode: (code: string, language: string) => void;
  onContinue: () => void;
  isContinuing: boolean;
  continuationStreamingContent: string | null;
  onPreviewFiles: (files: ProjectFile[]) => void;
}) {
  const { t, showTime } = useSettings();
  const isUser = message.role === "user";
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayContent = message.content + (continuationStreamingContent || "");
  const projectFiles = useMemo(() => extractProjectFiles(displayContent), [displayContent]);
  const hasProjectFiles = !isUser && projectFiles.length > 0;
  const canPreview =
    hasProjectFiles &&
    projectFiles.some((f) => PREVIEWABLE_EXTS.has((f.path.split(".").pop() || "").toLowerCase()));
  const segments = useMemo(() => parseMessageContent(displayContent), [displayContent]);

  const thinkingLabel = useMemo(() => {
    const secs = (message.thinkingDurationMs ?? 0) / 1000;
    return secs >= 1 ? t("thoughtFor", { n: Math.round(secs) }) : t("thinking");
  }, [message.thinkingDurationMs, t]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // تجاهل
    }
  };

  if (isUser) {
    return (
      <div className="animate-rise flex w-full justify-end px-4 py-3 sm:px-6">
        <div
          className={cn(
            "max-w-[85%] whitespace-pre-wrap rounded-xl rounded-ee-xs border border-hair",
            "bg-surface-3 px-4 py-2.5 text-[15px] leading-7 text-ink"
          )}
          dir="auto"
        >
          {message.content}
          {showTime && (
            <span className="tnum mt-1 block text-[10.5px] text-ink-3">
              {formatTime(message.createdAt)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <article className="animate-rise w-full px-4 py-4 sm:px-6">
      <div className="flex gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-accent-soft text-accent">
          <Sparkles size={14} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13.5px] font-semibold tracking-label text-ink">mlag</span>
            {message.tokensUsed > 0 && (
              <span className="tnum inline-flex items-center gap-1 text-[11.5px] text-ink-3">
                <Zap size={11} className="text-accent" />
                {message.tokensUsed}
              </span>
            )}
            {showTime && (
              <span className="tnum text-[11.5px] text-ink-3">{formatTime(message.createdAt)}</span>
            )}
          </div>

          {message.reasoning && (
            <div className="mb-3">
              <button
                onClick={() => setReasoningOpen(!reasoningOpen)}
                aria-expanded={reasoningOpen}
                className="inline-flex items-center gap-1.5 rounded-full py-1 text-[12.5px] font-medium text-ink-3 transition-colors duration-1 hover:text-ink"
              >
                <ChevronRight
                  size={13}
                  className={cn(
                    "transition-transform duration-2 ease-soft",
                    reasoningOpen && "rotate-90"
                  )}
                />
                {thinkingLabel}
              </button>
              {reasoningOpen && (
                <div className="animate-materialize mt-2 max-h-[220px] w-full overflow-y-auto rounded-md border border-hair bg-surface-2 px-3.5 py-3">
                  <p
                    dir="auto"
                    className="whitespace-pre-wrap text-[12.5px] leading-6 text-ink-2"
                  >
                    {message.reasoning}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="measure space-y-2">
            {segments.map((seg, i) =>
              seg.type === "text" ? (
                <p
                  key={i}
                  dir="auto"
                  className="whitespace-pre-wrap text-pretty text-[15px] leading-7 text-ink"
                >
                  {seg.text.trim()}
                </p>
              ) : hasProjectFiles ? null : (
                <CodeBlock key={i} language={seg.language} code={seg.code} onRun={onRunCode} />
              )
            )}
          </div>

          {hasProjectFiles && (
            <div className="measure mt-3">
              <ProjectFilesCard messageId={message.id} files={projectFiles} />
            </div>
          )}

          {canPreview && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={() => onPreviewFiles(projectFiles)}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors duration-1 hover:bg-accent hover:text-accent-ink"
              >
                <Eye size={13} />
                {t("previewPage")}
              </button>
            </div>
          )}

          {!isUser && message.isTruncated && (
            <div className="mt-3">
              {isContinuing ? (
                <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-3">
                  <span className="h-3 w-3 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
                  {t("continuing")}
                </span>
              ) : (
                <button
                  onClick={onContinue}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors duration-1 hover:border-hair-2 hover:text-ink"
                >
                  <Play size={12} />
                  {t("continueBtn")}
                </button>
              )}
            </div>
          )}

          <div className="mt-2">
            <button
              onClick={handleCopy}
              title={copied ? t("copied") : t("copy")}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
            >
              {copied ? <Check size={13} className="text-live" /> : <Copy size={13} />}
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
