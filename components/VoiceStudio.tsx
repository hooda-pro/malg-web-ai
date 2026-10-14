"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Download, Loader2, Mic, Play } from "lucide-react";
import { Button, Dialog } from "./ui/Controls";
import { useSettings } from "./SettingsContext";

/** الحد الأقصى لحروف النص — لازم يطابق TTS_TEXT_MAX_CHARS في lib/tts.ts (السيرفر هو المرجع) */
const TTS_TEXT_MAX_CHARS = 2000;

interface TtsModel {
  id: string;
  name: string;
  description: string;
  tier: "free" | "paid";
  locked: boolean;
  voice: string;
  isDefault: boolean;
}

/**
 * استوديو الصوت: نص → صوت عبر أي موديل صوتي يضيفه الأدمن (modality = 'tts').
 * للمشتركين (Pro) والأدمن فقط — البوابة على السيرفر، وهنا نعرض دعوة الاشتراك.
 */
export default function VoiceStudio({
  onClose,
  onOpenPlans,
}: {
  onClose: () => void;
  onOpenPlans: () => void;
}) {
  const { t } = useSettings();
  const [models, setModels] = useState<TtsModel[] | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [modelId, setModelId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioModel, setAudioModel] = useState("");
  const urlRef = useRef<string | null>(null);

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
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [load]);

  async function generate() {
    const value = text.trim();
    if (!value || value.length > TTS_TEXT_MAX_CHARS || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value, modelId: modelId || undefined }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        const err = new Error(j?.error || "تعذّر توليد الصوت") as Error & { needsSubscription?: boolean };
        if (j?.needsSubscription) err.needsSubscription = true;
        throw err;
      }
      const buf = await r.arrayBuffer();
      const blob = new Blob([buf], { type: r.headers.get("content-type") || "audio/mpeg" });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setAudioUrl(url);
      try {
        setAudioModel(decodeURIComponent(r.headers.get("x-tts-model") || ""));
      } catch {
        setAudioModel("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر توليد الصوت");
    } finally {
      setBusy(false);
    }
  }

  const selected = models?.find((m) => m.id === modelId) ?? null;

  return (
    <Dialog
      open
      onClose={onClose}
      labelledBy="mlag-voice-title"
      title={t("voiceStudio")}
      size="md"
    >
      <div className="flex flex-col gap-4 pb-2">
        {models === null && !error && (
          <p className="flex items-center gap-2 text-[13px] text-ink-2">
            <Loader2 size={14} className="animate-spin" />
            {t("ttsGenerating")}
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] leading-6 text-danger">
            {error}
          </p>
        )}

        {models !== null && !hasAccess && (
          <div className="rounded-xl border border-hair bg-surface-2 p-4 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-warn-soft text-warn">
              <Crown size={20} />
            </span>
            <p className="mt-2 text-[14px] font-semibold text-ink">{t("voiceProOnly")}</p>
            <Button variant="primary" size="sm" onClick={onOpenPlans} className="mt-3">
              {t("modelProBadge")} — {t("settingsBilling")}
            </Button>
          </div>
        )}

        {models !== null && hasAccess && (
          <>
            {models.length === 0 ? (
              <p className="rounded-md bg-warn-soft px-3 py-2 text-[13px] leading-6 text-warn">{t("ttsNoModels")}</p>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{t("ttsModelLabel")}</span>
                  <span className="relative block">
                    <select
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-hair bg-surface-2 pe-9 ps-3.5 text-[14px] text-ink focus:outline-none"
                      dir="auto"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id} disabled={m.locked}>
                          {m.name}
                          {m.locked ? ` (${t("modelProBadge")})` : ""}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium text-ink-2">
                    <span className="flex items-center gap-1.5">
                      <Mic size={13} />
                      {t("voiceStudio")}
                    </span>
                    <span className="tnum text-ink-3">
                      {text.trim().length}/{TTS_TEXT_MAX_CHARS}
                    </span>
                  </span>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value.slice(0, TTS_TEXT_MAX_CHARS))}
                    rows={5}
                    dir="auto"
                    placeholder={t("ttsPlaceholder")}
                    className="w-full resize-y rounded-xl border border-hair bg-surface-2 px-3.5 py-2.5 text-[14px] leading-7 text-ink placeholder:text-ink-3 focus:outline-none"
                  />
                </label>

                <Button variant="primary" onClick={generate} disabled={busy || !text.trim()}>
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  {busy ? t("ttsGenerating") : t("ttsGenerate")}
                </Button>

                {audioUrl && (
                  <div className="rounded-xl border border-hair bg-surface-2 p-3.5">
                    <p className="mb-2 truncate text-[12.5px] text-ink-2" dir="auto">
                      {audioModel || selected?.name || ""}
                    </p>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <audio controls src={audioUrl} className="w-full" />
                    <a
                      href={audioUrl}
                      download={`malg-voice-${Date.now()}.mp3`}
                      className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
                    >
                      <Download size={14} />
                      {t("ttsDownload")}
                    </a>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
