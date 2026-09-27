"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileArchive, FileText, Paperclip, Square, X } from "lucide-react";
import {
  formatBytes,
  processFile,
  type PendingAttachment,
} from "@/lib/attachments";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

export interface ComposerAttachment {
  file: File;
  extractedText?: string;
  previewUrl?: string;
  kind: "image" | "text";
}

export default function BottomInputBar({
  isGenerating,
  onSend,
  onStop,
  disabled,
}: {
  isGenerating: boolean;
  onSend: (text: string, attachments: ComposerAttachment[]) => void;
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

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [text]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const placeholders = list.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      kind: (file.type.startsWith("image/") ? "image" : "text") as PendingAttachment["kind"],
      loading: true,
    }));
    setAttachments((prev) => [...prev, ...placeholders]);

    placeholders.forEach(async (placeholder, idx) => {
      const processed = await processFile(list[idx]);
      setAttachments((prev) =>
        prev.map((a) => (a.id === placeholder.id ? { ...processed, id: placeholder.id } : a))
      );
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isGenerating) return;
    if (attachments.some((a) => a.loading)) return; // استنى لحد ما كل الملفات تخلص قراءة
    onSend(
      trimmed,
      attachments.map((a) => ({
        file: a.file,
        extractedText: a.extractedText,
        previewUrl: a.previewUrl,
        kind: a.kind,
      }))
    );
    setText("");
    setAttachments([]);
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
      className="relative shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6"
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
          "mx-auto w-full max-w-[760px] rounded-xl border border-hair bg-surface shadow-2",
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

        <textarea
          ref={taRef}
          id="mlag-composer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          rows={1}
          dir="auto"
          placeholder={t("placeholder")}
          disabled={disabled}
          aria-label={t("placeholder")}
          className={cn(
            "max-h-[220px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px]",
            "leading-7 text-ink placeholder:text-ink-3 outline-none focus:outline-none focus-visible:outline-none disabled:opacity-50"
          )}
        />

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
              onClick={onStop}
              title={t("stop")}
              aria-label={t("stop")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-ground transition-transform duration-1 ease-soft active:scale-[0.92]"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend || disabled}
              title={t("send")}
              aria-label={t("send")}
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent-ink",
                "bg-accent shadow-accent transition-all duration-1 ease-soft",
                "hover:bg-accent-hover active:scale-[0.92] disabled:bg-surface-3 disabled:text-ink-3 disabled:shadow-none"
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
      title={attachment.error || attachment.file.name}
    >
      {attachment.kind === "image" && attachment.previewUrl ? (
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
              : formatBytes(attachment.file.size)}
        </span>
      </span>

      {attachment.loading ? (
        <span className="h-3 w-3 shrink-0 animate-spin-slow rounded-full border-2 border-accent border-t-transparent" />
      ) : (
        <button
          onClick={onRemove}
          aria-label={t("removeAttachment")}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-ink-3 opacity-0 transition-opacity duration-1 hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
