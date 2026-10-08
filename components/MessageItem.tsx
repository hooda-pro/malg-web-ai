"use client";

import { memo, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Copy, Eye, FileArchive, FileText, Pencil, Play, RefreshCw, Trash2, Zap } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import type { ProjectFile } from "@/lib/parseContent";
import { extractDeliverableFiles, parseMessageContent, parseStreamingContent } from "@/lib/parseContent";
import { extractAttachmentsMeta, extractAttachmentsPromptSection, formatBytes } from "@/lib/attachments";
import {
  extractAgentStepsMeta,
  fileStepsFromStreamingSegments,
  reduceAgentEvents,
  type AgentEvent,
  type AgentStep,
} from "@/lib/agentEvents";
import { formatTime } from "@/lib/utils";
import { renderFormattedText } from "@/lib/markdown";
import ActivityBlock from "./ActivityBlock";
import CodeBlock from "./CodeBlock";
import ProjectFilesCard from "./ProjectFilesCard";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

const PREVIEWABLE_EXTS = new Set(["html", "htm", "css", "js"]);
const EMPTY_STEPS: AgentStep[] = [];

/** حالة الرد الحيّ أثناء البث — لو موجودة، الرسالة دي هي الرد اللي لسه بيتكتب. */
export interface LiveReply {
  agentEvents: AgentEvent[];
}

interface MessageItemProps {
  message: ChatMessage;
  onContinue: (messageId: string) => void;
  isContinuing: boolean;
  continuationStreamingContent: string | null;
  onPreviewFiles: (files: ProjectFile[], focusPath?: string) => void;
  /** الرد الحيّ بيتعرض بنفس الكومبوننت بتاع الرسالة المحفوظة — فعند نهاية البث
   * الرسالة بتتحدّث في مكانها بدل ما تتبدّل بعنصر جديد (ده كان سبب القفزة). */
  live?: LiveReply;
  /** أنيميشن الدخول للرسايل الجديدة بس (مش لأي رسالة بتتحمّل من الداتابيز) */
  animateIn?: boolean;
  /** آخر رد مساعد في الشات؟ — بس هو اللي ينفع يتعمله إعادة توليد */
  isLastAssistant?: boolean;
  onRegenerate?: (messageId: string) => void;
  isRegenerating?: boolean;
  /** تعديل رسالة مستخدم — الواجهة الأم بتفتح وضع التحرير وتبعت */
  onEdit?: (message: ChatMessage) => void;
  /** حذف رسالة واحدة (آخر رسالة) أو فرع من النقطة دي لآخر الشات */
  onDeleteMessage?: (message: ChatMessage) => void;
  onDeleteFromHere?: (message: ChatMessage) => void;
  /** أي عملية شغالة (توليد/تعديل/حذف) — الأزرار بتتقفل وقتها */
  actionsDisabled?: boolean;
}

function MessageItem({
  message,
  onContinue,
  isContinuing,
  continuationStreamingContent,
  onPreviewFiles,
  live,
  animateIn = false,
  isLastAssistant = false,
  onRegenerate,
  isRegenerating = false,
  onEdit,
  onDeleteMessage,
  onDeleteFromHere,
  actionsDisabled = false,
}: MessageItemProps) {
  const { t, showTime } = useSettings();
  const isUser = message.role === "user";
  const isLive = !!live;
  const [filesOpen, setFilesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wasLive = useRef(isLive);
  if (isLive) wasLive.current = true;

  // رسايل المساعد ممكن تحمل بيانات خطوات Agent مخفية (كتابة ملفات + بحث حقيقي
  // تم فعلاً في الرد ده) — بنفصلها عن النص عشان نعرض الـActivity Block فوق
  // الرد، ونستخدم النص النظيف (من غير كتلة البيانات) في كل حاجة تانية.
  const { visibleText: assistantCleanContent, steps: persistedAgentSteps } = useMemo(
    () =>
      isUser || isLive
        ? { visibleText: message.content, steps: EMPTY_STEPS }
        : extractAgentStepsMeta(message.content),
    [isUser, isLive, message.content]
  );

  const displayContent = isLive
    ? message.content
    : assistantCleanContent + (continuationStreamingContent || "");
  const projectFiles = useMemo(
    () => (isUser ? [] : extractDeliverableFiles(displayContent)),
    [isUser, displayContent]
  );
  const hasProjectFiles = !isUser && projectFiles.length > 0;
  const canPreview =
    hasProjectFiles &&
    projectFiles.some((f) => PREVIEWABLE_EXTS.has((f.path.split(".").pop() || "").toLowerCase()));
  const segments = useMemo(
    () => (isUser || isLive ? [] : parseMessageContent(displayContent)),
    [isUser, isLive, displayContent]
  );
  const streamSegments = useMemo(
    () => (isLive ? parseStreamingContent(message.content) : []),
    [isLive, message.content]
  );
  const liveAgentEvents = live?.agentEvents;
  const activitySteps = useMemo(
    () =>
      isLive
        ? [...reduceAgentEvents(liveAgentEvents ?? []), ...fileStepsFromStreamingSegments(streamSegments)]
        : persistedAgentSteps,
    [isLive, liveAgentEvents, streamSegments, persistedAgentSteps]
  );

  // رسايل المستخدم بس ممكن تحمل مرفقات (صور شكلية + محتوى ملفات مستخرج).
  // بنفصلهم عن النص عشان الفقاعة تفضل نضيفة وتعرض بس اللي المستخدم كتبه فعليًا.
  const { visibleText: userTextWithFiles, attachments: userAttachments } = useMemo(
    () => (isUser ? extractAttachmentsMeta(message.content) : { visibleText: message.content, attachments: [] }),
    [isUser, message.content]
  );
  const { mainText: userMainText, filesSection } = useMemo(
    () => extractAttachmentsPromptSection(userTextWithFiles),
    [userTextWithFiles]
  );
  const imageAttachments = userAttachments.filter((a) => a.kind === "image");
  const fileAttachments = userAttachments.filter((a) => a.kind !== "image");

  const thinkingLabel = useMemo(() => {
    const secs = (message.thinkingDurationMs ?? 0) / 1000;
    return secs >= 1 ? t("thoughtFor", { n: Math.round(secs) }) : t("thinking");
  }, [message.thinkingDurationMs, t]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(isUser ? userMainText : assistantCleanContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // تجاهل
    }
  };

  if (isUser) {
    return (
      <div className={cn("group flex w-full flex-col items-end px-4 py-3 sm:px-6", animateIn && "animate-rise")}>
        {imageAttachments.length > 0 && (
          <div className="mb-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {imageAttachments.map((a, i) =>
              a.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={a.previewUrl}
                  alt={a.name}
                  className="h-28 w-28 rounded-lg border border-hair object-cover shadow-1"
                />
              ) : null
            )}
          </div>
        )}

        {fileAttachments.length > 0 && (
          <div className="mb-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
            {fileAttachments.map((a, i) => (
              <span
                key={i}
                dir="ltr"
                className="inline-flex items-center gap-1.5 rounded-lg border border-hair bg-surface-2 px-2.5 py-1.5 text-[12px] text-ink-2"
              >
                {a.name.toLowerCase().endsWith(".zip") ? (
                  <FileArchive size={13} className="text-ink-3" />
                ) : (
                  <FileText size={13} className="text-ink-3" />
                )}
                <span className="max-w-[160px] truncate">{a.name}</span>
                <span className="tnum text-ink-3">{formatBytes(a.size)}</span>
              </span>
            ))}
          </div>
        )}

        {userMainText && (
          <div
            className={cn(
              "msg-in max-w-[85%] whitespace-pre-wrap break-words rounded-xl rounded-ee-xs border border-hair",
              "bg-surface-3 px-4 py-2.5 text-[15px] leading-7 text-ink shadow-1"
            )}
            dir="auto"
          >
            {userMainText}
          </div>
        )}

        {filesSection && (
          <div className="mt-1.5 max-w-[85%]">
            <button
              onClick={() => setFilesOpen((o) => !o)}
              aria-expanded={filesOpen}
              className="inline-flex items-center gap-1.5 rounded-full py-1 text-[12px] font-medium text-ink-3 transition-colors duration-1 hover:text-ink"
            >
              <ChevronRight
                size={12}
                className={cn("chev shrink-0", filesOpen && "chev-open")}
              />
              {t("attachedFilesContent")}
            </button>
            {filesOpen && (
              <div
                className="animate-materialize mt-1.5 max-h-[280px] overflow-y-auto rounded-md border border-hair bg-surface-2 px-3.5 py-3 text-start"
                dir="ltr"
              >
                <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-ink-2">
                  {filesSection}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="mt-1 flex items-center gap-1 opacity-0 transition-opacity duration-1 focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          {showTime && (
            <span className="tnum px-1 text-[11px] text-ink-3">{formatTime(message.createdAt)}</span>
          )}
          <button
            onClick={handleCopy}
            title={copied ? t("copied") : t("copy")}
            aria-label={copied ? t("copied") : t("copy")}
            disabled={actionsDisabled}
            className="grid h-7 w-7 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
          >
            {copied ? <Check size={13} className="text-live" /> : <Copy size={13} />}
          </button>
          {onEdit && (
            <button
              onClick={() => onEdit(message)}
              title={t("editMessage")}
              aria-label={t("editMessage")}
              disabled={actionsDisabled}
              className="grid h-7 w-7 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
            >
              <Pencil size={13} />
            </button>
          )}
          {onDeleteFromHere && (
            <button
              onClick={() => onDeleteFromHere(message)}
              title={t("deleteFromHere")}
              aria-label={t("deleteFromHere")}
              disabled={actionsDisabled}
              className="grid h-7 w-7 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    );
  }

  // مفتاح ثابت لبادئة الـMarkdown: نفس القيمة قبل وبعد نهاية البث، فعناصر النص
  // مش بتتعاد تركيبها لحظة تحويل الرد الحيّ لرسالة محفوظة.
  const keyBase = message.clientKey ?? message.id;
  const hasReasoning = !!message.reasoning;
  // التفكير جزء من تجربة النشاط الموحّدة (ActivityBlock) — لا يُعرض كمكوّن منفصل
  // ينافس خطوات الأدوات، ولا يُعرض التفكير الخام في الواجهة الرئيسية.
  const showThinking = isLive ? !message.content || hasReasoning : hasReasoning;
  const thinking = showThinking
    ? {
        label: thinkingLabel,
        durationMs: message.thinkingDurationMs,
        body: message.reasoning,
        live: isLive,
      }
    : null;
  const showContinueRow = !isLive && (message.isTruncated || isContinuing);

  return (
    <article
      className={cn("msg-in w-full px-4 py-4 sm:px-6", animateIn && "animate-rise")}
      aria-busy={isLive || undefined}
      aria-live={isLive ? "polite" : undefined}
    >
      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[12px] font-medium tracking-label text-ink-3">MALG</span>
            {!isLive && message.tokensUsed > 0 && (
              <span className="tnum inline-flex items-center gap-1 text-[11.5px] text-ink-3">
                <Zap size={11} className="text-accent" />
                {message.tokensUsed.toLocaleString("en-US")}
              </span>
            )}
            {!isLive && showTime && (
              <span className="tnum text-[11.5px] text-ink-3">{formatTime(message.createdAt)}</span>
            )}
          </div>

          {(thinking || activitySteps.length > 0) && (
            <div className="mb-2.5">
              <ActivityBlock steps={activitySteps} isActive={isLive} thinking={thinking} />
            </div>
          )}

          {!isLive && hasProjectFiles && (
            <div className={cn("measure mb-3", wasLive.current && "animate-materialize")}>
              <ProjectFilesCard messageId={message.id} files={projectFiles} onOpen={onPreviewFiles} />
            </div>
          )}

          <div className="measure flex flex-col gap-3" dir="auto">
            {isLive
              // أثناء البث: الـ prose ممكن يحمل كتل شرح (من غير path) — نفكها هنا
              // لقطع نص/كود inline بنفس منطق الرسالة المحفوظة. كتل التسليم (path)
              // مكانها كارت الملفات والأكتيفيتي، مش نص الشات.
              ? streamSegments.flatMap((seg, i): ReactNode[] => {
                  if (seg.type !== "prose" || !seg.text.trim()) return [];
                  const subs = parseMessageContent(seg.text);
                  const isLastSeg = streamSegments
                    .slice(i + 1)
                    .every((s) => s.type !== "prose" || !s.text.trim());
                  return subs.flatMap((sub, j): ReactNode[] => {
                    const kk = `${keyBase}-live-${i}-${j}`;
                    const isLast = isLastSeg && j === subs.length - 1;
                    if (sub.type === "text") {
                      if (!sub.text.trim()) return [];
                      return [
                        <div key={kk} className={cn(isLast && "caret-last")}>
                          {renderFormattedText(sub.text.trim(), kk)}
                        </div>,
                      ];
                    }
                    if (sub.path) return [];
                    return [<CodeBlock key={kk} language={sub.language} code={sub.code} />];
                  });
                })
              : segments.map((seg, i) =>
                  seg.type === "text" ? (
                    seg.text.trim() ? (
                      <div key={i}>{renderFormattedText(seg.text.trim(), `${keyBase}-${i}`)}</div>
                    ) : null
                  ) : seg.path ? null : (
                    <CodeBlock key={i} language={seg.language} code={seg.code} />
                  )
                )}
          </div>

          {(canPreview || showContinueRow) && (
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
                    onClick={() => onContinue(message.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-hair bg-surface px-3 py-1.5 text-[12.5px] font-medium text-ink-2 shadow-1 transition-colors duration-1 hover:border-hair-2 hover:text-ink"
                  >
                    <Play size={12} />
                    {t("continueBtn")}
                  </button>
                )
              )}
            </div>
          )}

          {/* صف النسخ محجوز مكانه من أول لحظة (مخفي أثناء البث) عشان الرسالة متزيدش
              ارتفاع فجأة لحظة ما تخلص. */}
          <div className={cn("mt-2 flex items-center gap-1", isLive && "invisible")}>
            <button
              onClick={handleCopy}
              tabIndex={isLive ? -1 : undefined}
              title={copied ? t("copied") : t("copy")}
              disabled={actionsDisabled}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
            >
              {copied ? <Check size={13} className="text-live" /> : <Copy size={13} />}
              {copied ? t("copied") : t("copy")}
            </button>
            {isLastAssistant && onRegenerate && (
              <button
                onClick={() => onRegenerate(message.id)}
                tabIndex={isLive ? -1 : undefined}
                title={t("regenerate")}
                disabled={actionsDisabled || isRegenerating}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
              >
                <RefreshCw size={13} className={cn(isRegenerating && "animate-spin")} />
                {isRegenerating ? t("regenerating") : t("regenerate")}
              </button>
            )}
            {onDeleteMessage && (
              <button
                onClick={() => onDeleteMessage(message)}
                tabIndex={isLive ? -1 : undefined}
                title={t("deleteMessage")}
                disabled={actionsDisabled}
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-ink-3 transition-colors duration-1 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
              >
                <Trash2 size={13} />
                {t("deleteMessage")}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default memo(MessageItem);
