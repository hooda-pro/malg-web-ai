"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Play,
  Sparkles,
  User,
} from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type { ProjectFile } from "@/lib/parseContent";
import { extractProjectFiles, parseMessageContent } from "@/lib/parseContent";
import { formatTime } from "@/lib/utils";
import { renderFormattedText } from "@/lib/markdown";
import CodeBlock from "./CodeBlock";
import ProjectFilesCard from "./ProjectFilesCard";
import { useSettings } from "./SettingsContext";

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

  return (
    <div
      className={`animate-slideUp [animation-fill-mode:both] flex w-full gap-2 px-2.5 py-1.5 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
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
            {showTime && <span className="text-[9px] text-txt3">{formatTime(message.createdAt)}</span>}
          </div>
        )}

        {/* مؤشر التفكير — كلمة واحدة عارية فوق الفقاعة، من غير أي فقاعة حواليها */}
        {!isUser && message.reasoning && (
          <div className="mb-2">
            <button
              onClick={() => setReasoningOpen(!reasoningOpen)}
              className="flex items-center gap-1 rounded px-0.5"
              title={`${t("thinkShow")} • ${thinkingLabel}`}
            >
              <span
                className={`mono text-[11px] font-bold text-amber transition-transform duration-200 ${
                  reasoningOpen ? "rotate-90" : ""
                }`}
              >
                {">"}
              </span>
              <span className="text-[11px] font-bold text-amber">{t("thinking")}</span>
            </button>
            {reasoningOpen && (
              <div className="reasoning-box animate-fadeIn mt-1.5 max-h-[200px] w-[320px] max-w-full overflow-y-auto rounded-md border border-line2 bg-panel3 px-2.5 py-2">
                <p className="whitespace-pre-wrap text-[11px] leading-5 text-txt2">
                  {message.reasoning}
                </p>
              </div>
            )}
          </div>
        )}

        <div
          className={`rounded-lg border px-3 py-2 ${
            isUser
              ? "rounded-tl-lg rounded-bl-lg rounded-br-sm border-cyan/40 bg-[#0c1a17]"
              : "rounded-tr-lg rounded-br-lg rounded-bl-sm border-line2 bg-panel2"
          }`}
        >
          {hasProjectFiles && (
            <div className="mb-2">
              <ProjectFilesCard messageId={message.id} files={projectFiles} onOpen={onPreviewFiles} />
            </div>
          )}

          {segments.map((seg, i) =>
            seg.type === "text" ? (
              isUser ? (
                <p
                  key={i}
                  className="whitespace-pre-wrap break-words text-[13.5px] leading-6 text-txt"
                >
                  {seg.text.trim()}
                </p>
              ) : (
                <div key={i}>{renderFormattedText(seg.text.trim(), `${message.id}-${i}`)}</div>
              )
            ) : hasProjectFiles ? null : (
              <CodeBlock key={i} language={seg.language} code={seg.code} onRun={onRunCode} />
            )
          )}

          {!isUser && (message.isTruncated || isContinuing) && (
            <div className="mt-2">
              {isContinuing ? (
                <div className="flex items-center gap-2 text-[11.5px] text-txt2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan border-t-transparent" />
                  {t("continuing")}
                </div>
              ) : (
                <button
                  onClick={onContinue}
                  className="flex items-center gap-1.5 rounded-md border border-cyan/50 bg-cyan/10 px-3 py-1.5 text-[11.5px] font-medium text-cyan hover:bg-cyan/15"
                >
                  <Play size={13} /> {t("continueBtn")}
                </button>
              )}
            </div>
          )}

          <div className="mt-1 flex items-center justify-between">
            {isUser && showTime ? (
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
