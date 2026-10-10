"use client";

import { useRef, useState } from "react";
import { ArrowUp, FileArchive, FileText, Paperclip, Square, X } from "lucide-react";
import {
  formatBytes,
  isVideoFile,
  makeAttachmentId,
  processFile,
  type PendingAttachment,
} from "@/lib/attachments";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

export interface ComposerAttachment {
  file: File;
  extractedText?: string;
  previewUrl?: string;
  kind: "image" | "text" | "video";
  frames?: { dataUrl: string; atSec: number }[];
  durationSec?: number;
  videoDataUrl?: string;
}

/**
 * خانة الكتابة بتكبر وتصغر من غير أي JavaScript بيقيس ارتفاع: فيه "مرآة" مخفية
 * (نفس النص ونفس الخط والحشو) واقفة في نفس خلية الـgrid مع الـtextarea، فالارتفاع
 * بيتحدد من المرآة. لما النص يتمسح بعد الإرسال المرآة بترجع سطر واحد والخانة بترجع
 * لحجمها الأصلي فورًا — مستحيل تفضل طويلة وفاضية. (الطريقة القديمة كانت بتحسب
 * style.height يدويًا وبتعمل قفزة في القايمة اللي فوقها مع كل حرف.)
 * الخط 16px على الموبايل عشان iOS ما يعملش zoom تلقائي أول ما تضغط على الخانة.
 */
const FIELD_TEXT = "px-4 pb-1 pt-3.5 text-[16px] leading-7 sm:text-[15px]";

// Above this length, a paste turns into a .txt attachment instead of composer text.
const PASTE_AS_FILE_CHARS = 3000;

export default function BottomInputBar({
  isGenerating,
  onSend,
  onStop,
  disabled,
}: {
  isGenerating: boolean;
  onSend: (text: string, attachments: ComposerAttachment[]) => Promise<boolean> | void;
  onStop: () => void;
  disabled: boolean;
}) {
  const { t, enterToSend } = useSettings();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    list.forEach(async (file) => {
      // Video becomes frame images (async extraction) with a temp placeholder
      if (isVideoFile(file)) {
        // Video uploads are paused for now (native video needs a paid
        // provider). The extraction pipeline stays in the codebase for later.
        // Keep the file visible as a flagged chip so the user knows why.
        const denied: PendingAttachment = {
          id: makeAttachmentId(),
          file,
          kind: "text",
          loading: false,
          error: "رفع الفيديو متوقف حاليا",
        };
        setAttachments((prev) => [...prev, denied]);
        return;
      }
      const placeholder: PendingAttachment = {
        id: makeAttachmentId(),
        file,
        kind: (file.type.startsWith("image/") ? "image" : "text") as PendingAttachment["kind"],
        loading: true,
      };
      setAttachments((prev) => [...prev, placeholder]);
      const processed = await processFile(file);
      setAttachments((prev) =>
        prev.map((a) => (a.id === placeholder.id ? { ...processed, id: placeholder.id } : a))
      );
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isGenerating) return;
    if (attachments.some((a) => a.loading)) return; // استنى لحد ما كل الملفات تخلص قراءة
    // مهم: بنمسح نص/مرفقات الكومبوزر فورًا لما الإرسال يتقبل — مش بعد ما
    // البث يخلص (ده ممكن ياخد دقايق، والنص الطويل كان بيفضل في الـ textarea
    // والمرفقات قايمة تحته طوال التوليد). لو الإرسال فشل فعلًا (شبكة، خطأ
    // سيرفر...)، بنرجّع النص والمرفقات زي ما كانوا عشان المستخدم ما يضيعش حاجة.
    const sentText = text;
    const sentAttachments = attachments;
    setText("");
    setAttachments([]);
    const ok = await onSend(
      trimmed,
      sentAttachments.map((a) => ({
        file: a.file,
        extractedText: a.extractedText,
        previewUrl: a.previewUrl,
        kind: a.kind,
        frames: a.frames,
        durationSec: a.durationSec,
        videoDataUrl: a.videoDataUrl,
      }))
    );
    if (ok === false) {
      setText(sentText);
      setAttachments(sentAttachments);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const withMod = e.metaKey || e.ctrlKey;
    if (enterToSend ? !e.shiftKey : withMod) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
      return;
    }
    // Long pasted text becomes a file attachment (Claude-style) instead of
    // flooding the composer. Typed text is never converted, only pastes.
    const pastedText = e.clipboardData?.getData("text") || "";
    if (pastedText.length > PASTE_AS_FILE_CHARS) {
      e.preventDefault();
      const firstLine = (pastedText.split("\n").find((l) => l.trim()) || "pasted-text")
        .trim()
        .slice(0, 30)
        .replace(/[^\w\u0600-\u06FF\-. ]+/g, "")
        .trim();
      const name = `${firstLine || "pasted-text"}-${Date.now().toString(36)}.txt`;
      addFiles([new File([pastedText], name, { type: "text/plain" })]);
    }
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    if (e.dataTransfer.types.includes("Files")) setDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setDragOver(false);
    }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const hasLoadingAttachment = attachments.some((a) => a.loading);
  const canSend = (!!text.trim() || attachments.length > 0) && !hasLoadingAttachment;

  return (
    <div
      className="m-composer relative shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-gradient-to-t from-[var(--ground)] to-transparent"
      />

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        className={cn(
          "mx-auto w-full max-w-[760px] rounded-2xl border border-hair bg-surface-2 shadow-2 composer-glow",
          "transition-[border-color,box-shadow] duration-2 ease-soft",
          "focus-within:!border-accent-line focus-within:shadow-[0_2px_8px_rgba(0,0,0,0.05),0_28px_60px_-28px_var(--accent-line)]",
          dragOver && "!border-accent-line ring-2 ring-accent-line ring-offset-0"
        )}
      >
        {dragOver && (
          <div className="pointer-events-none flex items-center justify-center gap-2 rounded-t-xl border-b border-dashed border-accent-line bg-accent-soft px-4 py-3 text-[13px] font-medium text-accent">
            <Paperclip size={14} />
            {t("dropFilesHint")}
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-hair px-3 pb-2.5 pt-3">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
            ))}
          </div>
        )}

        <div className="grid max-h-[220px]">
          <div
            aria-hidden="true"
            dir="auto"
            className={cn(
              FIELD_TEXT,
              "pointer-events-none invisible col-start-1 row-start-1 max-h-[220px] overflow-hidden whitespace-pre-wrap break-words"
            )}
          >
            {/* المرآة بتحجز مكان الـplaceholder كمان لو النص فاضي (لو لفّ على سطرين) */}
            {(text || t("placeholder")) + "\u200b"}
          </div>
          <textarea
            ref={taRef}
            id="mlag-composer"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            dir="auto"
            enterKeyHint={enterToSend ? "send" : "enter"}
            placeholder={t("placeholder")}
            disabled={disabled}
            aria-label={t("placeholder")}
            className={cn(
              FIELD_TEXT,
              "col-start-1 row-start-1 h-full min-h-0 w-full resize-none overflow-y-auto bg-transparent",
              "text-ink outline-none placeholder:text-ink-3 focus:outline-none focus-visible:outline-none disabled:opacity-50"
            )}
          />
        </div>

        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title={t("attachFiles")}
            aria-label={t("attachFiles")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
          >
            <Paperclip size={16} />
          </button>

          <p className="min-w-0 flex-1 truncate px-1.5 text-[11.5px] text-ink-3">
            {enterToSend ? t("composerHint") : t("enterToSendHint")}
          </p>

          {isGenerating ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={onStop}
              title={t("stop")}
              aria-label={t("stop")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-ground transition-transform duration-1 ease-soft active:scale-[0.92]"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSend}
              disabled={!canSend || disabled}
              title={t("send")}
              aria-label={t("send")}
              className={cn(
                "btn-send grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent-ink",
                "transition-all duration-1 ease-soft",
                "active:scale-[0.94] disabled:bg-surface-3 disabled:text-ink-3 disabled:shadow-none"
              )}
            >
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          )}
        </div>
      </div>

      <p className="mx-auto mt-2 max-w-[760px] text-center text-[11px] text-ink-3">
        {t("disclaimer")}
      </p>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  const { t } = useSettings();
  const isZip = attachment.file.name.toLowerCase().endsWith(".zip");

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 overflow-hidden rounded-lg border border-hair bg-surface-2 py-1.5 pe-2 ps-1.5",
        attachment.error && "border-danger/40"
      )}
      title={attachment.error || attachment.note || attachment.file.name}
    >
      {attachment.kind === "video" ? (
        <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-3 text-ink-3">
          {attachment.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={attachment.previewUrl}
              alt={attachment.file.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <FileText size={15} />
          )}
          <span className="absolute grid h-5 w-5 place-items-center rounded-full bg-black/55 text-[10px] text-white">
            &#9654;
          </span>
        </span>
      ) : attachment.kind === "image" && attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt={attachment.file.name}
          className="h-9 w-9 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface-3 text-ink-3">
          {isZip ? <FileArchive size={15} /> : <FileText size={15} />}
        </span>
      )}

      <span className="flex min-w-0 flex-col">
        <span className="max-w-[130px] truncate text-[12px] font-medium text-ink" dir="ltr">
          {attachment.file.name}
        </span>
        <span className="text-[10.5px] text-ink-3">
          {attachment.loading
            ? t("attachmentReading")
            : attachment.error
              ? t("attachmentIssue")
              : `${formatBytes(attachment.file.size)}${attachment.note ? " · ⓘ" : ""}`}
        </span>
      </span>

      {attachment.loading ? (
        <span className="h-3 w-3 shrink-0 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
      ) : (
        <button
          onClick={onRemove}
          aria-label={t("removeAttachment")}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-3 opacity-0 transition-opacity duration-1 hover:bg-surface-3 hover:text-ink group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
