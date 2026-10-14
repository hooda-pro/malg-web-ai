"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Download, Loader2, Mic, Play, X } from "lucide-react";
import { Button } from "./ui/Controls";
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

interface Clip {
  id: number;
  url: string;
  text: string;
  modelName: string;
  at: number;
}

/**
 * استوديو الصوت كصفحة كاملة (مش popup): نص → صوت عبر أي موديل صوتي
 * يضيفه الأدمن (modality = 'tts'). للمشتركين (Pro) والأدمن فقط.
 */
export default function VoiceStudio({ onOpenPlans }: { onOpenPlans: () => void }) {
  const { t } = useSettings();
  const [models, setModels] = useState<TtsModel[] | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [modelId, setModelId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
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

  function trackUrl(url: string) {
    urlsRef.current.push(url);
  }

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
      const url = URL.createObjectURL(blob);
      trackUrl(url);
      let modelName = "";
      try {
        modelName = decodeURIComponent(r.headers.get("x-tts-model") || "");
      } catch {
        modelName = "";
      }
      clipSeq.current += 1;
      setClips((prev) => [
        { id: clipSeq.current, url, text: value, modelName, at: Date.now() },
        ...prev,
      ]);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر توليد الصوت");
    } finally {
      setBusy(false);
    }
  }

  const selected = models?.find((m) => m.id === modelId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-10 pt-8 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent text-accent-ink shadow-accent">
            <Mic size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-[19px] font-semibold tracking-display text-ink">
              {t("voiceStudio")}
              <span className="shrink-0 rounded-full bg-warn-soft px-2 py-px text-[10.5px] font-bold text-warn">
                {t("modelProBadge")}
              </span>
            </h1>
          </div>
        </div>

        <div className="mt-5">
          {models === null && !error && (
            <p className="flex items-center gap-2 text-[13px] text-ink-2">
              <Loader2 size={14} className="animate-spin" />
              {t("ttsGenerating")}
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] leading-6 text-danger">
              {error}
            </p>
          )}

          {models !== null && !hasAccess && (
            <div className="rounded-2xl border border-hair bg-surface p-6 text-center shadow-1">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-warn-soft text-warn">
                <Crown size={22} />
              </span>
              <p className="mt-3 text-[15px] font-semibold text-ink">{t("voiceProOnly")}</p>
              <Button variant="primary" size="sm" onClick={onOpenPlans} className="mt-4">
                {t("modelProBadge")} — {t("settingsBilling")}
              </Button>
            </div>
          )}

          {models !== null && hasAccess && (
            <>
              {models.length === 0 ? (
                <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] leading-6 text-warn">{t("ttsNoModels")}</p>
              ) : (
                <div className="rounded-2xl border border-hair bg-surface-2 p-4 shadow-2">
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">{t("ttsModelLabel")}</span>
                    <span className="relative block">
                      <select
                        value={modelId}
                        onChange={(e) => setModelId(e.target.value)}
                        className="h-11 w-full cursor-pointer appearance-none rounded-xl border border-hair bg-surface pe-9 ps-3.5 text-[14px] text-ink focus:outline-none"
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

                  <label className="mt-3 block">
                    <span className="mb-1.5 flex items-center justify-between text-[12.5px] font-medium text-ink-2">
                      <span>{t("voiceStudio")}</span>
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
                      className="w-full resize-y rounded-xl border border-hair bg-surface px-3.5 py-2.5 text-[15px] leading-7 text-ink placeholder:text-ink-3 focus:outline-none"
                    />
                  </label>

                  <Button variant="primary" onClick={generate} disabled={busy || !text.trim()} className="mt-3 w-full">
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                    {busy ? t("ttsGenerating") : t("ttsGenerate")}
                  </Button>
                </div>
              )}

              {clips.length > 0 && (
                <div className="mt-5">
                  <h2 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-micro text-ink-3">
                    {t("ttsHistory")}
                  </h2>
                  <ul className="space-y-2">
                    {clips.map((c) => (
                      <li key={c.id} className="rounded-2xl border border-hair bg-surface p-3.5 shadow-1">
                        <p className="truncate text-[13px] text-ink-2" dir="auto" title={c.text}>
                          {c.text}
                        </p>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                        <audio controls src={c.url} className="mt-2 w-full" />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="truncate text-[11.5px] text-ink-3" dir="auto">
                            {c.modelName || selected?.name || ""}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <a
                              href={c.url}
                              download={`malg-voice-${c.at}.mp3`}
                              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium text-accent hover:bg-accent-soft"
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
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
