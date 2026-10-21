"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, FileArchive, FileText, Mic, Paperclip, Plus, Puzzle, Square, X } from "lucide-react";
import {
  ATTACHMENTS_ENABLED,
  detectAttachmentKind,
  formatBytes,
  isArchiveFile,
  isVideoFile,
  makeAttachmentId,
  MAX_UPLOAD_BYTES,
  readImagePreview,
  uploadAttachmentFile,
  type AttachmentKind,
  type PendingAttachment,
} from "@/lib/attachments";
import { useSettings, type ModelId } from "./SettingsContext";
import { ModelPicker } from "./TopBar";
import { cn } from "@/lib/utils";
import type { SkillRecord } from "@/lib/skills";

export interface ComposerAttachment {
  file: File;
  extractedText?: string;
  previewUrl?: string;
  remoteUrl?: string;
  kind: AttachmentKind;
  frames?: { dataUrl: string; atSec: number }[];
  durationSec?: number;
  videoDataUrl?: string;
}

/** أقل واجهة لازمة من Web Speech API (بدون اعتماد على lib.dom). */
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

/**
 * خانة الكتابة بتكبر وتصغر من غير أي JavaScript بيقيس ارتفاع: فيه "مرآة" مخفية
 * (نفس النص ونفس الخط والحشو) واقفة في نفس خلية الـgrid مع الـtextarea، فالارتفاع
 * بيتحدد من المرآة. لما النص يتمسح بعد الإرسال المرآة بترجع سطر واحد والخانة بترجع
 * لحجمها الأصلي فورًا — مستحيل تفضل طويلة وفاضية. (الطريقة القديمة كانت بتحسب
 * style.height يدويًا وبتعمل قفزة في القايمة اللي فوقها مع كل حرف.)
 * الخط 16px على الموبايل عشان iOS ما يعملش zoom تلقائي أول ما تضغط على الخانة.
 */
const FIELD_TEXT =
  "pb-3 pt-3 text-[16px] leading-7 sm:text-[15px] ps-12 pe-12";

// Above this length, a paste turns into a .txt attachment instead of composer text.
const PASTE_AS_FILE_CHARS = 3000;

export default function BottomInputBar({
  isGenerating,
  onSend,
  onStop,
  disabled,
  embedded,
  lockedModel,
  onPickModel,
  onLockedModel,
  micEnabled,
  onOpenSkills,
  skillsActive = 0,
  skillsMenu = [],
}: {
  isGenerating: boolean;
  onSend: (text: string, attachments: ComposerAttachment[]) => Promise<boolean> | void;
  onStop: () => void;
  disabled: boolean;
  /** وضع المنتصف (شات جديد): بدون حواف جانبية إضافية */
  embedded?: boolean;
  /** الموديل اللي الشات الحالي متثبت عليه (لو اتبعت فيه رسايل بالفعل) */
  lockedModel?: ModelId | null;
  onPickModel: (id: ModelId) => void;
  /** ضغطة على موديل مقفول (اشتراك) — تفتح الباقات بدل الاختيار */
  onLockedModel?: (id: ModelId) => void;
  /** إظهار زر المايك (تسجيل صوتي → نص) — فقط لو موديل الشات مفعّل له من الأدمن */
  micEnabled?: boolean;
  /** عدد المهارات المحلية الفعّالة (>0 = يظهر شيب صغير) — الضغط يفتح إدارة المهارات */
  skillsActive?: number;
  /** قايمة المهارات المحلية (اسم + وصف) لمنيو أوامر السلاش / — من جهاز المستخدم */
  skillsMenu?: Pick<SkillRecord, "name" | "description">[];
  onOpenSkills?: () => void;
}) {
  const { t, lang, enterToSend } = useSettings();
  const [text, setText] = useState("");
  // إشعار حظر الأرشيفات المضغوطة — كارت أنيق فوق الخانة (مش شفاف) ويقفل بإيد المشترك
  const [zipBlocked, setZipBlocked] = useState(false);

  // --- منيو أوامر المهارات (/): يبان أول ما النص يبدأ بـ / والمستخدم لسه بيكتب الاسم ---
  const [slashIdx, setSlashIdx] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const slashBody = text.startsWith("/") ? text.slice(1) : "";
  const slashReady = slashBody.length > 0 && !/\s/.test(slashBody); // من غير مسافة = لسه بيكتب الاسم
  const slashQuery = slashReady ? slashBody.toLowerCase() : "";
  const slashMatches = useMemo(
    () => (slashQuery ? skillsMenu.filter((s) => s.name.toLowerCase().includes(slashQuery)).slice(0, 6) : []),
    [slashQuery, skillsMenu]
  );
  // لو الاسم اتبكتب كاملًا (تطابق تام) المنيو يختفي — Enter وقتها يبعت على طول
  const slashExact = slashQuery.length > 0 && skillsMenu.some((s) => s.name.toLowerCase() === slashQuery);
  const slashOpen = slashReady && !slashExact && slashMatches.length > 0 && !slashDismissed;
  useEffect(() => setSlashIdx(0), [slashQuery]);
  const applySlashChoice = (idx: number) => {
    const pick = slashMatches[idx];
    if (!pick) return;
    setText(`/${pick.name} `);
    setSlashDismissed(false);
  };

  // نص كتبه الزائر في خانة صفحة الهبوط قبل تسجيل الدخول — بيتحط في الخانة مرة واحدة.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem("malg-pending-prompt");
      if (pending) {
        sessionStorage.removeItem("malg-pending-prompt");
        setText(pending);
      }
    } catch {
      // sessionStorage غير متاح
    }
  }, []);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  // ---- التسجيل الصوتي (مايك → نص) عبر Web Speech API — يظهر فقط لو مفعّل للموديل ----
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop: () => void } | null>(null);
  const listeningRef = useRef(false);
  const micSupported =
    typeof window !== "undefined" &&
    !!(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    );
  useEffect(
    () => () => {
      listeningRef.current = false;
      try {
        recRef.current?.stop();
      } catch {
        // تجاهل
      }
    },
    []
  );
  const stopMic = () => {
    listeningRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      // تجاهل
    }
    recRef.current = null;
    setListening(false);
  };
  const toggleMic = () => {
    if (listeningRef.current) {
      stopMic();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    try {
      const rec = new Ctor();
      rec.lang = lang === "ar" ? "ar-EG" : lang === "fr" ? "fr-FR" : lang === "es" ? "es-ES" : "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      rec.onresult = (e) => {
        let chunk = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) chunk += r[0].transcript;
        }
        const said = chunk.trim();
        if (said) setText((prev) => (prev ? `${prev} ${said}` : said));
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") stopMic();
      };
      rec.onend = () => {
        // كروم بيوقف التعرف بعد وقفة — نعيد التشغيل تلقائيًا طول ما الزرار شغال
        if (listeningRef.current) {
          try {
            rec.start();
          } catch {
            stopMic();
          }
        }
      };
      recRef.current = rec;
      listeningRef.current = true;
      rec.start();
      setListening(true);
    } catch {
      stopMic();
    }
  };

  const addFiles = (files: FileList | File[]) => {
    if (!ATTACHMENTS_ENABLED) return;
    const list = Array.from(files);
    if (list.length === 0) return;
    // حظر فوري للأرشيفات المضغوطة — مفيش chip ولا بيتثبت حاجة؛ إشعار أنيق منفصل
    const archives = list.filter(isArchiveFile).length;
    const rest = list.filter((f) => !isArchiveFile(f));
    if (archives > 0) setZipBlocked(true);
    if (rest.length === 0) return;
    rest.forEach(async (file) => {
      // ملف أضخم من الحد — بنرفضه فورًا من غير ما نقراه في الذاكرة.
      if (file.size > MAX_UPLOAD_BYTES) {
        setAttachments((prev) => [
          ...prev,
          {
            id: makeAttachmentId(),
            file,
            kind: "text",
            loading: false,
            error: t("attachTooBig", { size: formatBytes(MAX_UPLOAD_BYTES) }),
          },
        ]);
        return;
      }
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
          error: t("attachVideoPaused"),
        };
        setAttachments((prev) => [...prev, denied]);
        return;
      }
      const placeholder: PendingAttachment = {
        id: makeAttachmentId(),
        file,
        kind: detectAttachmentKind(file.name, file.type),
        loading: true,
      };
      setAttachments((prev) => [...prev, placeholder]);
      // معاينة فورية للصور (عرض فقط — المحتوى المرسل هو رابط التخزين الخارجي).
      if (placeholder.kind === "image") {
        const preview = await readImagePreview(file);
        if (preview) {
          setAttachments((prev) =>
            prev.map((a) => (a.id === placeholder.id ? { ...a, previewUrl: preview } : a))
          );
        }
      }
      // رفع الملف الخام على التخزين الخارجي — طلب الشات بيشيل الرابط بس.
      try {
        const remote = await uploadAttachmentFile(file);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === placeholder.id
              ? { ...a, loading: false, remoteUrl: remote.url, kind: remote.kind }
              : a
          )
        );
      } catch (e) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === placeholder.id
              ? {
                  ...a,
                  loading: false,
                  error:
                    e instanceof Error && e.message
                      ? e.message
                      : t("attachUploadFail"),
                }
              : a
          )
        );
      }
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSend = async () => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isGenerating) return;
    if (attachments.some((a) => a.loading)) return; // استنى لحد ما كل الملفات تخلص قراءة
    // الملفات لازم تكون اترفعت (remoteUrl) قبل الإرسال — الفاشلة (error) يتبعت اسمها بس.
    if (attachments.some((a) => !a.remoteUrl && !a.error)) return;
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
        remoteUrl: a.remoteUrl,
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
    if (slashOpen) {
      if (e.key === "Escape") {
        setSlashDismissed(true);
        return;
      }
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length);
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        e.preventDefault();
        applySlashChoice(slashIdx);
        return;
      }
    }
    if (e.key !== "Enter") return;
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    const withMod = e.metaKey || e.ctrlKey;
    if (enterToSend ? !e.shiftKey : withMod) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // رفع الملفات معطّل مؤقتًا — اللصق بينزل كنص عادي.
    if (!ATTACHMENTS_ENABLED) return;
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
    if (!ATTACHMENTS_ENABLED) return;
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
    if (!ATTACHMENTS_ENABLED) return;
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const hasLoadingAttachment = attachments.some((a) => a.loading);
  const hasPendingUpload = attachments.some((a) => !a.remoteUrl && !a.error);
  const canSend = (!!text.trim() || attachments.length > 0) && !hasLoadingAttachment && !hasPendingUpload;

  return (
    <div
      className={cn(
        "m-composer relative shrink-0",
        embedded ? "w-full px-0 pb-1 pt-4" : "px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6"
      )}
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
          "relative mx-auto w-full max-w-[760px] rounded-2xl border border-hair bg-surface-2 shadow-2",
          "transition-[border-color] duration-2 ease-soft",
          dragOver && "!border-accent-line"
        )}
      >
        {slashOpen && (
          <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-2xl border border-hair bg-surface-2 shadow-2">
            {slashMatches.map((s, i) => (
              <button
                key={s.name}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySlashChoice(i);
                }}
                onMouseEnter={() => setSlashIdx(i)}
                className={cn(
                  "flex w-full items-baseline gap-2.5 px-3.5 py-2 text-start transition-colors duration-1",
                  i === slashIdx ? "bg-accent-soft" : "hover:bg-surface-3"
                )}
                dir="auto"
              >
                <span className="shrink-0 font-mono text-[13px] font-medium text-accent">/{s.name}</span>
                <span className="truncate text-[11.5px] text-ink-3">{s.description}</span>
              </button>
            ))}
            <div className="border-t border-hair px-3.5 py-1.5 text-[11px] text-ink-3" dir="auto">
              {t("slashHint")}
            </div>
          </div>
        )}

        {dragOver && (
          <div className="pointer-events-none flex items-center justify-center gap-2 rounded-t-xl border-b border-dashed border-accent-line bg-accent-soft px-4 py-3 text-[13px] font-medium text-accent">
            <Paperclip size={14} />
            {t("dropFilesHint")}
          </div>
        )}

        {/* كارت حظر الأرشيفات المضغوطة — تصميم أنيق عنوانه fixedة ومن غير شفافية */}
        {zipBlocked && (
          <div
            role="alert"
            className="relative overflow-hidden rounded-t-xl border-b border-accent-line bg-accent-soft px-4 py-3"
          >
            <div className="pointer-events-none absolute -top-12 -start-12 h-28 w-28 rounded-full bg-accent/10 blur-2xl" aria-hidden="true" />
            <div className="relative flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-ink shadow-sm">
                <FileArchive size={16} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-ink">{t("zipBlockedTitle")}</p>
                <p className="mt-1 text-[12.5px] leading-5 text-ink-2">{t("zipBlockedBody")}</p>
              </div>
              <button
                type="button"
                onClick={() => setZipBlocked(false)}
                aria-label={t("closeNotice")}
                title={t("closeNotice")}
                className="shrink-0 rounded-lg p-1.5 text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-hair px-3 pb-2.5 pt-3">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)} />
            ))}
          </div>
        )}

        <div className="relative grid max-h-[220px]">
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
            name="mlag-composer"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSlashDismissed(false);
            }}
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
          {isGenerating ? (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={onStop}
              title={t("stop")}
              aria-label={t("stop")}
              className="absolute bottom-2 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-ground transition-transform duration-1 ease-soft end-2 active:scale-[0.92] rtl:end-auto rtl:start-2"
            >
              <Square size={11} fill="currentColor" />
            </button>
          ) : (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSend}
              disabled={!canSend || disabled}
              title={t("send")}
              aria-label={t("send")}
              className={cn(
                "btn-send absolute bottom-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-accent-ink end-2",
                "transition-all duration-1 ease-soft rtl:end-auto rtl:start-2",
                "active:scale-[0.94] disabled:bg-surface-3 disabled:text-ink-3 disabled:shadow-none"
              )}
            >
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
          )}
          {micEnabled && micSupported && !isGenerating && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleMic}
              disabled={disabled}
              title={listening ? t("micStop") : t("micRecord")}
              aria-label={listening ? t("micStop") : t("micRecord")}
              aria-pressed={listening}
              className={cn(
                "absolute bottom-2 left-2 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors duration-1 disabled:opacity-40",
                listening ? "mic-live bg-danger text-white" : "text-ink-3 hover:bg-surface-3 hover:text-ink"
              )}
            >
              {listening ? <Square size={11} fill="currentColor" /> : <Mic size={17} />}
            </button>
          )}
        </div>
      </div>

      {/* صف تحت الخانة زي كلود: اختيار الموديل في الأول (يمين) والتنبيه في النص وزر + في الآخر (شمال) */}
      <div className="mx-auto mt-2 flex max-w-[760px] items-center gap-2 px-1">
        <ModelPicker
          compact
          dropUp
          lockedModel={lockedModel}
          onPickModel={onPickModel}
          onLockedModel={onLockedModel}
        />
        {onOpenSkills && skillsActive > 0 && (
          <button
            onClick={onOpenSkills}
            title="مهاراتك الفعّالة — على جهازك بس"
            className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-hair bg-surface px-2.5 text-[11px] text-ink-2 transition-colors duration-1 hover:border-hair-2 hover:text-ink"
          >
            <Puzzle size={12} />
            {skillsActive}
          </button>
        )}
        <p className="min-w-0 flex-1 text-center text-[11px] leading-4 text-ink-3">
          {t("disclaimer")}
        </p>
        {ATTACHMENTS_ENABLED ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            title={t("attachFiles")}
            aria-label={t("attachFiles")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
          >
            <Plus size={17} />
          </button>
        ) : (
          <span className="w-8 shrink-0" aria-hidden="true" />
        )}
      </div>
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
