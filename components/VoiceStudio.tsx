"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  ChevronDown,
  Crown,
  Download,
  Loader2,
  Laugh,
  Play,
  Smile,
  TriangleAlert,
  Type,
  Waves,
  X,
} from "lucide-react";
import { Button } from "./ui/Controls";
import { cn } from "@/lib/utils";
import { useSettings } from "./SettingsContext";

/** الحد الأقصى لحروف النص — لازم يطابق TTS_TEXT_MAX_CHARS في lib/tts.ts (السيرفر هو المرجع) */
const TTS_TEXT_MAX_CHARS = 2000;

/** طوابع الأداء (علامات S2 open-domain: أي وصف بين أقواس مربعة) — بالترتيب المنطقي */
type TtsMood = "" | "playful" | "angry" | "excited" | "calm" | "whispering";
const MOODS: { value: TtsMood; key: string }[] = [
  { value: "", key: "ttsNormal" },
  { value: "playful", key: "ttsMoodPlayful" },
  { value: "angry", key: "ttsMoodAngry" },
  { value: "excited", key: "ttsMoodExcited" },
  { value: "calm", key: "ttsMoodCalm" },
  { value: "whispering", key: "ttsMoodWhisper" },
];

/** نوع الصوت المطلوب — ذكر/أنثى بيتحول وصف مفتوح للـS2، فاضي = التلقائي بتاع المزوّد */
type TtsGender = "" | "male" | "female";

interface TtsModel {
  id: string;
  name: string;
  description: string;
  tier: "free" | "paid";
  locked: boolean;
  voice: string;
  isDefault: boolean;
  /** النموذج بيدعم نسخ الصوت بعينة مرجعية (وسم clone في قدراته) */
  canClone?: boolean;
  /** النموذج بيدعم لمسة الأداء (علامات S2 — مزوّدات OpenRouter/Fish) */
  styleOk?: boolean;
}

interface Clip {
  id: number;
  url: string;
  text: string;
  modelName: string;
  /** وصف اللمسة المختارة (فرفوش · ضحك · سريع) وقت التوليد */
  label?: string;
  at: number;
}

/** حد العينة المرجعية للنسخ الصوتي — لازم يطابق حد السيرفر (~15MB فك ضغط من 20MB base64) */
const TTS_REF_MAX_BYTES = 15 * 1024 * 1024;

/** عنوان قسم صغير: أيقونة + نص مختصر — بيثبّت شكل كل أقسام الاستوديو */
function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
      <span className="shrink-0 text-ink-3">{icon}</span>
      {children}
    </span>
  );
}

/** شرائح اختيار واحدة (طابع/سرعة/ضحك) — State بنفس المظهر للكل */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[12.5px] transition-colors duration-1",
        active
          ? "border-accent-line bg-accent-soft text-accent"
          : "border-hair text-ink-2 hover:border-hair-2 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/**
 * استوديو الصوت كصفحة كاملة: نص → صوت عبر أي موديل صوتي يضيفه الأدمن (modality = 'tts').
 * الأقسام مرتبة: الموديل ← النص ← اللمسة الصوتية (طابع/سرعة/ضحك) ← عينة النسخ ← التوليد.
 * للمشتركين (Pro) والأدمن فقط.
 */
export default function VoiceStudio({ onOpenPlans }: { onOpenPlans: () => void }) {
  const { t } = useSettings();
  const [models, setModels] = useState<TtsModel[] | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [modelId, setModelId] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const modelRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  /** اللمسة: صوت ذكر/أنثى + طابع + سريع شوية + ضحك — بتتحول لعلامات S2 جوه النص على السيرفر */
  const [gender, setGender] = useState<TtsGender>("");
  const [mood, setMood] = useState<TtsMood>("");
  const [brisk, setBrisk] = useState(false);
  const [laughs, setLaughs] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const styleRef = useRef<HTMLDivElement>(null);
  /** العينة المرجعية لنسخ الصوت (data URL) — بتظهر مع موديلات canClone */
  const [refClip, setRefClip] = useState<{ name: string; dataUrl: string } | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);
  const clipSeq = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tts", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر التحميل");
      const list = (Array.isArray(j.models) ? j.models : []) as TtsModel[];
      setModels(list);
      setHasAccess(!!j.hasAccess);
      setModelId((prev) => {
        if (prev && list.some((m) => m.id === prev && !m.locked)) return prev;
        return list.find((m) => !m.locked)?.id ?? list[0]?.id ?? "";
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر التحميل");
      setModels([]);
    }
  }, []);

  useEffect(() => {
    void load();
    const urls = urlsRef.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [load]);

  useEffect(() => {
    if (!modelOpen) return;
    const onDown = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModelOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [modelOpen]);

  // قائمة اللمسة: إغلاق عند الضغط بره أو Escape — بنفس نمط قائمة الموديل
  useEffect(() => {
    if (!styleOpen) return;
    const onDown = (e: MouseEvent) => {
      if (styleRef.current && !styleRef.current.contains(e.target as Node)) setStyleOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStyleOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [styleOpen]);

  function removeClip(id: number) {
    setClips((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
        urlsRef.current = urlsRef.current.filter((u) => u !== target.url);
      }
      return prev.filter((c) => c.id !== id);
    });
  }

  /** اختيار العينة المرجعية — عمرة كحد أقصى 15MB وتتحول data URL */
  function pickClip(f: File | null) {
    if (!f) return;
    if (f.size > TTS_REF_MAX_BYTES) {
      setError(t("ttsCloneTooBig"));
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      if (typeof fr.result === "string") setRefClip({ name: f.name, dataUrl: fr.result });
    };
    fr.onerror = () => setError(t("ttsCloneTooBig"));
    fr.readAsDataURL(f);
  }

  /** تصفير اللمسة كلها — يرجّع أداء المزوّد التلقائي */
  function resetStyle() {
    setGender("");
    setMood("");
    setBrisk(false);
    setLaughs(false);
  }

  /** وصف اللمسة المختارة لمرة واحدة — للشارة على الزرار والتاريخ */
  function styleSummary() {
    if (!selected?.styleOk) return "";
    return [
      gender === "male" ? t("ttsMale") : gender === "female" ? t("ttsFemale") : "",
      mood ? t(MOODS.find((m) => m.value === mood)?.key ?? "") : "",
      laughs ? t("ttsLaughs") : "",
      brisk ? t("ttsSpeedBrisk") : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  async function generate() {
    const value = text.trim();
    if (!value || value.length > TTS_TEXT_MAX_CHARS || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: value,
          modelId: modelId || undefined,
          referenceAudio: refClip?.dataUrl,
          style: { voiceGender: gender, mood, speed: brisk ? "brisk" : "", laughs },
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        const err = new Error(j?.error || "تعذّر توليد الصوت") as Error & { needsSubscription?: boolean };
        if (j?.needsSubscription) err.needsSubscription = true;
        throw err;
      }
      const buf = await r.arrayBuffer();
      const blob = new Blob([buf], { type: r.headers.get("content-type") || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      urlsRef.current.push(url);
      let modelName = "";
      try {
        modelName = decodeURIComponent(r.headers.get("x-tts-model") || "");
      } catch {
        modelName = "";
      }
      const label = styleSummary();
      clipSeq.current += 1;
      setClips((prev) => [{ id: clipSeq.current, url, text: value, modelName, label, at: Date.now() }, ...prev]);
      // نسيب النص بعد النجاح — يعدّل ويجادّد براحته
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر توليد الصوت");
    } finally {
      setBusy(false);
    }
  }

  const selected = models?.find((m) => m.id === modelId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-10 pt-6 sm:px-6 sm:pt-8">
        {/* بطاقة الترويسة */}
        <div className="relative overflow-hidden rounded-3xl border border-hair bg-surface p-5 shadow-2 sm:p-6">
          <div className="aurora" aria-hidden="true">
            <span className="aurora-blob left-[70%] top-[-60%] h-48 w-48" style={{ background: "var(--aurora-1)" }} />
            <span className="aurora-blob aurora-blob-b left-[4%] top-[10%] h-40 w-40" style={{ background: "var(--aurora-2)" }} />
          </div>
          <div className="relative flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-hover p-3 text-accent-ink shadow-accent">
              <AudioLines size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="flex flex-wrap items-center gap-2 text-[20px] font-semibold tracking-display text-ink">
                {t("voiceStudio")}
                <span className="shrink-0 rounded-full bg-warn-soft px-2 py-px text-[10.5px] font-bold text-warn">
                  {t("modelProBadge")}
                </span>
              </h1>
              <p className="mt-0.5 truncate text-[13px] text-ink-2">{t("voiceStudioHint")}</p>
            </div>
          </div>
        </div>

        <div className="mt-4">
          {models === null && !error && (
            <p className="flex items-center gap-2 text-[13px] text-ink-2">
              <Loader2 size={14} className="animate-spin" />
              {t("ttsGenerating")}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="mb-3 flex items-start gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-[13px] leading-6 text-danger"
            >
              <TriangleAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0">{error}</span>
            </p>
          )}

          {models !== null && !hasAccess && (
            <div className="rounded-3xl border border-hair bg-surface p-8 text-center shadow-2">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warn-soft text-warn">
                <Crown size={24} />
              </span>
              <p className="mt-3 text-[16px] font-semibold text-ink">{t("voiceProOnly")}</p>
              <p className="mx-auto mt-1 max-w-[40ch] text-[13px] leading-6 text-ink-2">{t("voiceStudioHint")}</p>
              <Button variant="primary" size="sm" onClick={onOpenPlans} className="mt-4">
                {t("modelProBadge")} — {t("settingsBilling")}
              </Button>
            </div>
          )}

          {models !== null && hasAccess && (
            <>
              {models.length === 0 ? (
                <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] leading-6 text-warn">{t("ttsNoModels")}</p>
              ) : (
                <div className="rounded-3xl border border-hair bg-surface-2 p-4 shadow-2 sm:p-5">
                  {/* ——— ١) الموديل الصوتي ——— */}
                  <SectionLabel icon={<AudioLines size={13} aria-hidden="true" />}>{t("ttsModelLabel")}</SectionLabel>
                  <div className="relative" ref={modelRef}>
                    <button
                      type="button"
                      onClick={() => setModelOpen((o) => !o)}
                      aria-haspopup="listbox"
                      aria-expanded={modelOpen}
                      className="flex h-12 w-full items-center gap-2 rounded-2xl border border-hair bg-surface px-3.5 text-[14px] shadow-1 transition-colors hover:border-hair-2"
                    >
                      <AudioLines size={15} className="shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-start font-medium text-ink" dir="auto">
                        {selected?.name ?? ""}
                      </span>
                      {!!selected?.voice && (
                        <span
                          className="tnum hidden shrink-0 rounded-full bg-surface-3 px-2 py-px text-[11px] text-ink-2 sm:inline"
                          dir="ltr"
                        >
                          {selected.voice}
                        </span>
                      )}
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={cn("shrink-0 text-ink-3 transition-transform duration-2", modelOpen && "rotate-180")}
                      />
                    </button>
                    {modelOpen && (
                      <div
                        role="listbox"
                        aria-label={t("ttsModelLabel")}
                        className="animate-materialize glass absolute inset-x-0 top-[calc(100%+6px)] z-modal max-h-[280px] overflow-y-auto rounded-2xl border border-hair p-1.5 shadow-3"
                      >
                        {models.map((m) => {
                          const sel = m.id === modelId;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              role="option"
                              aria-selected={sel}
                              disabled={m.locked}
                              onClick={() => {
                                setModelId(m.id);
                                setModelOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start transition-colors duration-1 disabled:opacity-60",
                                sel ? "bg-accent-soft" : "hover:bg-surface-3"
                              )}
                            >
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-[13.5px] font-medium text-ink" dir="auto">
                                    {m.name}
                                  </span>
                                  {m.locked && (
                                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-warn-soft px-1.5 py-px text-[10.5px] font-bold text-warn">
                                      <Crown size={10} />
                                      {t("modelProBadge")}
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 flex items-center gap-1.5">
                                  {!!m.voice && (
                                    <span className="tnum block truncate text-[11.5px] text-ink-3" dir="ltr">
                                      {m.voice}
                                    </span>
                                  )}
                                  {m.styleOk && (
                                    <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-[10px] text-accent">
                                      {t("ttsStyleSection")}
                                    </span>
                                  )}
                                </span>
                              </span>
                              <span className="grid h-6 w-6 shrink-0 place-items-center">
                                {sel ? (
                                  <Check size={15} strokeWidth={3} className="text-accent" />
                                ) : m.locked ? (
                                  <Crown size={13} className="text-ink-3" />
                                ) : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ——— ٢) النص ——— */}
                  <label className="mt-5 block">
                    <span className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium text-ink-2">
                      <span className="flex items-center gap-1.5">
                        <Type size={13} className="text-ink-3" aria-hidden="true" />
                        {t("ttsTextLabel")}
                      </span>
                      <span className="tnum text-ink-3">
                        {text.trim().length}/{TTS_TEXT_MAX_CHARS}
                      </span>
                    </span>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, TTS_TEXT_MAX_CHARS))}
                      rows={6}
                      dir="auto"
                      placeholder={t("ttsPlaceholder")}
                      className="min-h-[150px] w-full resize-y rounded-2xl border border-hair bg-surface px-4 py-3 text-[15px] leading-8 text-ink shadow-1 placeholder:text-ink-3 focus:outline-none"
                    />
                  </label>

                  {/* ——— ٣) اللمسة الصوتية: زرار يفتح الخيارات (موديلات OpenRouter/Fish بس) ——— */}
                  {selected?.styleOk && (
                    <div className="relative mt-5" ref={styleRef}>
                      <button
                        type="button"
                        onClick={() => setStyleOpen((o) => !o)}
                        aria-haspopup="dialog"
                        aria-expanded={styleOpen}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] transition-colors duration-1",
                          styleOpen || styleSummary()
                            ? "border-accent-line bg-accent-soft text-accent"
                            : "border-hair text-ink-2 hover:border-hair-2 hover:text-ink"
                        )}
                      >
                        <Smile size={14} aria-hidden="true" />
                        {t("ttsStyleSection")}
                        {styleSummary() && (
                          <span
                            className="max-w-[150px] truncate rounded-full bg-surface px-2 py-px text-[10.5px] text-accent"
                            dir="auto"
                          >
                            {styleSummary()}
                          </span>
                        )}
                        <ChevronDown
                          size={13}
                          aria-hidden="true"
                          className={cn("shrink-0 text-ink-3 transition-transform duration-2", styleOpen && "rotate-180")}
                        />
                      </button>
                      {styleOpen && (
                        <div
                          role="dialog"
                          aria-label={t("ttsStyleSection")}
                          className="animate-materialize glass absolute inset-x-0 top-[calc(100%+6px)] z-modal rounded-2xl border border-hair p-4 shadow-3 sm:p-5"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[11.5px] text-ink-3">{t("ttsVoice")}</span>
                            <Chip active={gender === ""} onClick={() => setGender("")}>
                              {t("ttsNormal")}
                            </Chip>
                            <Chip active={gender === "male"} onClick={() => setGender("male")}>
                              {t("ttsMale")}
                            </Chip>
                            <Chip active={gender === "female"} onClick={() => setGender("female")}>
                              {t("ttsFemale")}
                            </Chip>
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11.5px] text-ink-3">{t("ttsMood")}</span>
                            {MOODS.map((m) => (
                              <Chip key={m.value || "normal"} active={mood === m.value} onClick={() => setMood(m.value)}>
                                {t(m.key)}
                              </Chip>
                            ))}
                          </div>
                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[11.5px] text-ink-3">{t("ttsSpeed")}</span>
                            <Chip active={!brisk} onClick={() => setBrisk(false)}>
                              {t("ttsNormal")}
                            </Chip>
                            <Chip active={brisk} onClick={() => setBrisk(true)}>
                              {t("ttsSpeedBrisk")}
                            </Chip>
                          </div>
                          <div className="mt-2.5 flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setLaughs((v) => !v)}
                              aria-pressed={laughs}
                              className={cn(
                                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors duration-1",
                                laughs
                                  ? "border-accent-line bg-accent-soft text-accent"
                                  : "border-hair text-ink-2 hover:border-hair-2 hover:text-ink"
                              )}
                            >
                              <Laugh size={13} aria-hidden="true" />
                              {t("ttsLaughs")}
                              {laughs && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                            </button>
                            <button
                              type="button"
                              onClick={resetStyle}
                              className="rounded-full px-2 py-1.5 text-[11.5px] text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
                            >
                              {t("ttsReset")}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ——— ٤) عينة النسخ المرجعية (موديلات canClone بس) ——— */}
                  {!!selected?.canClone && (
                    <div className="mt-5">
                      <SectionLabel icon={<Waves size={13} aria-hidden="true" />}>{t("ttsCloneLabel")}</SectionLabel>
                      {refClip ? (
                        <div className="flex items-center gap-2 rounded-2xl border border-accent-line bg-accent-soft/40 px-3.5 py-2.5">
                          <AudioLines size={14} className="shrink-0 text-accent" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" dir="auto">
                            {refClip.name}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRefClip(null)}
                            aria-label={t("deleteBtn")}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => refInputRef.current?.click()}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-hair-2 px-3 py-3.5 text-[12px] text-ink-3 transition-colors hover:border-accent-line hover:text-ink-2"
                        >
                          <AudioLines size={15} aria-hidden="true" />
                          {t("ttsCloneHint")}
                        </button>
                      )}
                      <input
                        ref={refInputRef}
                        type="file"
                        accept=".wav,.mp3,.m4a,.flac,.ogg,.webm,.aac,audio/*"
                        className="hidden"
                        onChange={(e) => {
                          pickClip(e.target.files?.[0] ?? null);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  )}

                  {/* ——— ٥) التوليد ——— */}
                  <Button
                    variant="primary"
                    onClick={generate}
                    disabled={busy || !text.trim()}
                    className="btn-sheen mt-5 h-12 w-full !rounded-2xl !text-[15px]"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    {busy ? t("ttsGenerating") : t("ttsGenerate")}
                  </Button>
                </div>
              )}

              {clips.length > 0 ? (
                <div className="mt-6">
                  <h2 className="mb-2 flex items-center gap-2 px-1 text-[12px] font-semibold uppercase tracking-micro text-ink-3">
                    {t("ttsHistory")}
                    <span className="tnum rounded-full bg-surface-3 px-2 py-px text-[11px]">{clips.length}</span>
                  </h2>
                  <ul className="space-y-2.5">
                    {clips.map((c, i) => (
                      <li
                        key={c.id}
                        className={
                          i === 0
                            ? "rounded-3xl border border-accent-line bg-surface p-4 shadow-2"
                            : "rounded-3xl border border-hair bg-surface p-4 shadow-1"
                        }
                      >
                        <p className="truncate text-[13.5px] font-medium text-ink" dir="auto" title={c.text}>
                          {c.text}
                        </p>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <audio controls src={c.url} className="mt-2.5 w-full" />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-ink-3">
                            <span className="truncate" dir="auto">
                              {c.modelName || selected?.name || ""}
                            </span>
                            {c.label && (
                              <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-[10.5px]" dir="auto">
                                {c.label}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <a
                              href={c.url}
                              download={`malg-voice-${c.at}.mp3`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent hover:text-accent-ink"
                            >
                              <Download size={13} />
                              {t("ttsDownload")}
                            </a>
                            <button
                              type="button"
                              onClick={() => removeClip(c.id)}
                              aria-label={t("deleteBtn")}
                              className="grid h-7 w-7 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
                            >
                              <X size={13} />
                            </button>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                models.length > 0 && (
                  <div className="mt-6 rounded-3xl border border-dashed border-hair-2 px-4 py-8 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-3 text-ink-3">
                      <AudioLines size={20} />
                    </span>
                    <p className="mt-2 text-[13px] text-ink-3">{t("ttsEmpty")}</p>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
