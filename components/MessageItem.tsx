"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Eye, Play, Sparkles, Zap } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type { ProjectFile } from "@/lib/parseContent";
import { extractProjectFiles, parseMessageContent } from "@/lib/parseContent";
import { formatTime } from "@/lib/utils";
import { renderFormattedText } from "@/lib/markdown";
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
  onPreviewFiles: (files: ProjectFile[], focusPath?: string) => void;
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
      <div className="group animate-rise flex w-full flex-col items-end px-4 py-3 sm:px-6">
        <div
          className={cn(
            "max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-ee-xs border border-hair",
            "bg-surface-3 px-4 py-2.5 text-[15px] leading-7 text-ink"
          )}
          dir="auto"
        >
          {message.content}
        </div>
        <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity duration-1 focus-within:opacity-100 group-hover:opacity-100">
          {showTime && (
            <span className="tnum px-1 text-[11px] text-ink-3">{formatTime(message.createdAt)}</span>
          )}
          <button
            onClick={handleCopy}
            title={copied ? t("copied") : t("copy")}
            aria-label={copied ? t("copied") : t("copy")}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
          >
            {copied ? <Check size={13} className="text-live" /> : <Copy size={13} />}
          </button>
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
                {message.tokensUsed.toLocaleString("en-US")}
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
                    "flip-rtl transition-transform duration-2 ease-soft",
                    reasoningOpen && "rotate-90"
                  )}
                />
                {thinkingLabel}
              </button>
              {reasoningOpen && (
                <div className="animate-materialize mt-2 max-h-[260px] w-full overflow-y-auto rounded-md border border-hair bg-surface-2 px-3.5 py-3">
                  <div dir="auto" className="text-[13px] leading-6 text-ink-2 [&_p]:text-[13px] [&_p]:leading-6 [&_p]:text-ink-2">
                    {renderFormattedText(message.reasoning, `${message.id}-reasoning`)}
                  </div>
                </div>
              )}
            </div>
          )}

          {hasProjectFiles && (
            <div className="measure mb-3">
              <ProjectFilesCard messageId={message.id} files={projectFiles} onOpen={onPreviewFiles} />
            </div>
          )}

          <div className="measure flex flex-col gap-3" dir="auto">
            {segments.map((seg, i) =>
              seg.type === "text" ? (
                seg.text.trim() ? (
                  <div key={i}>
                    {renderFormattedText(seg.text.trim(), `${message.id}-${i}`)}
                  </div>
                ) : null
              ) : hasProjectFiles ? null : (
                <CodeBlock key={i} language={seg.language} code={seg.code} onRun={onRunCode} />
              )
            )}
          </div>

          {(canPreview || message.isTruncated || isContinuing) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canPreview && (
                <button
                  onClick={() => onPreviewFiles(projectFiles)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors duration-1 hover:bg-accent hover:text-accent-ink"
                >
                  <Eye size={13} />
                  {t("previewPage")}
                </button>
              )}
              {isContinuing ? (
                <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-3">
                  <span className="h-3 w-3 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
                  {t("continuing")}
                </span>
              ) : (
                message.isTruncated && (
                  <button
                    onClick={onContinue}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-1 transition-colors duration-1 hover:border-hair-2 hover:text-ink"
                  >
                    <Play size={12} />
                    {t("continueBtn")}
                  </button>
                )
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-1">
            <button
              onClick={handleCopy}
              title={copied ? t("copied") : t("regenerateHint")}
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
