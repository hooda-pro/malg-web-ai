"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AudioLines,
  AudioWaveform,
  Check,
  ChevronRight,
  Copy,
  Crown,
  DollarSign,
  FlaskConical,
  KeyRound,
  Loader2,
  MessageSquare,
  Mic,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { ModelSummary, ProviderConfigPublic, ProviderProtocol } from "@/lib/provider";
import { fmtPrice } from "./helpers";
import ConfirmModal from "./ConfirmModal";

type NotifyFn = (type: "ok" | "err", text: string) => void;

const INPUT_CLS = "w-full rounded-md border border-hair bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none";

interface Loaded {
  active: ProviderConfigPublic;
  fromEnv: boolean;
  model: { id: string; name: string; isDefault: boolean } | null;
}

const PRESETS: { label: string; name: string; baseUrl: string; model: string; protocol: ProviderProtocol }[] = [
  { label: "Z.AI — GLM-4.7-Flash (Free)", name: "Z.AI", baseUrl: "https://api.z.ai/api/paas/v4", model: "glm-4.7-flash", protocol: "chat_completions" },
  { label: "Token Harbor — DeepSeek V4.1", name: "Token Harbor", baseUrl: "https://tokenharbor.ai/v1", model: "deepseek-v4.1-flash:free", protocol: "chat_completions" },
  { label: "OpenRouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "deepseek/deepseek-chat-v3-0324:free", protocol: "chat_completions" },
  { label: "DeepSeek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", protocol: "chat_completions" },
  { label: "OpenAI", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", protocol: "chat_completions" },
  { label: "OpenAI — Responses", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", protocol: "responses" },
  { label: "Groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", protocol: "chat_completions" },
];

const PROTOCOL_OPTIONS: { value: ProviderProtocol; label: string; hint: string }[] = [
  { value: "chat_completions", label: "Chat Completions", hint: "messages + /chat/completions — الأنسب لمعظم المزوّدات" },
  { value: "responses", label: "Responses API", hint: "input + /responses — لبعض النماذج مثل Muse Spark" },
];

/** قدرات الصوت — فعّل اللي النموذج بيدعمه فعلاً حسب صفحته على المزوّد */
const CAPS: { tag: string; label: string; hint: string }[] = [
  {
    tag: "stt",
    label: "قراءة صوت",
    hint: "ترجمة الرسايل الصوتية عبر مدخل audio في الشات (موديلات audio-native)",
  },
  {
    tag: "stt_transcriptions",
    label: "تفريغ صوتي",
    hint: "التفريغ عبر /audio/transcriptions — موديلات تفريغ خالصة زي whisper",
  },
  {
    tag: "tts",
    label: "توليد صوت",
    hint: "بيظهر في استوديو الصوت (نص ← صوت)",
  },
  {
    tag: "clone",
    label: "نسخ صوتي",
    hint: "بيسمح بعينة مرجعية لتقليد الصوت في الاستوديو",
  },
];

/** صيغ الصوت المسموحة في محرر الصيغ (زي السيرفر) */
const FORMATS_ALLOWED = ["mp3", "pcm", "wav", "opus", "m4a", "flac", "webm", "aac"];

/**
 * صفحة تفاصيل الموديل (تحديث ٢٠) — على نفس نمط تفاصيل المستخدم:
 * كل إعدادات الموديل الواحد مترtributes فيها — بياناته، خصائصه، التسعير،
 * مزوّده ومفاتيحه، وإعدادات الصوت (قدرات/صيغ/صوت افتراضي)، ومنطقة الحذف.
 */
export default function AdminModelDetail({
  modelId,
  onBack,
  notify,
}: {
  modelId: string;
  onBack: () => void;
  notify: NotifyFn;
}) {
  const [summary, setSummary] = useState<ModelSummary | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);

  // ——— نموذج المزوّد ———
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [protocol, setProtocol] = useState<ProviderProtocol>("chat_completions");
  const [model, setModel] = useState("");
  const [firstKey, setFirstKey] = useState("");
  const [temperature, setTemperature] = useState("0.4");
  const [maxTokens, setMaxTokens] = useState("128000");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string; detail?: string; endpoint?: string } | null>(null);

  // ——— المفاتيح ———
  const [newKey, setNewKey] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [rowTest, setRowTest] = useState<Record<number, { ok: boolean; text: string }>>({});
  const [copyingIdx, setCopyingIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // ——— التسعير (تحديث ١٩/١٩.١): In/Out + ربح ثابت + سياق + هامش ×N ———
  const [priceIn, setPriceIn] = useState("");
  const [priceOut, setPriceOut] = useState("");
  const [flatProfit, setFlatProfit] = useState("");
  const [ctxNote, setCtxNote] = useState("");
  const [margin, setMargin] = useState("");
  const [priceSaving, setPriceSaving] = useState(false);

  // ——— خصائص الموديل ———
  const [acting, setActing] = useState(false);
  const [capsBusy, setCapsBusy] = useState(false);
  const [formatsDraft, setFormatsDraft] = useState("");
  const [voice, setVoice] = useState("");
  const [pulling, setPulling] = useState(false);

  // ——— إعادة تسمية + حذف ———
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showDelete, setShowDelete] = useState(false);

  /** تحميل ملخص الموديل من قايمة الأدمن (الـAPI بيجيب الكل) */
  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/models");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل تحميل الموديلات");
    const list = (data.models ?? []) as ModelSummary[];
    const s = list.find((m) => m.id === modelId) ?? null;
    setSummary(s);
    if (s) setFormatsDraft(s.audioFormats.join(","));
    return s;
  }, [modelId]);

  const loadProvider = useCallback(async () => {
    const res = await fetch(`/api/admin/provider?modelId=${encodeURIComponent(modelId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل التحميل");
    setLoaded({ active: data.active, fromEnv: data.fromEnv, model: data.model ?? null });
    const a = data.active as ProviderConfigPublic;
    setName(a.name || "");
    setBaseUrl(a.baseUrl || "");
    setProtocol((a as { protocol?: ProviderProtocol }).protocol === "responses" ? "responses" : "chat_completions");
    setModel(a.model || "");
    setTemperature(String(0.4));
    setMaxTokens(String(128000));
    setFirstKey("");
    setNewKey("");
    setRowTest({});
    setConfirmRemove(null);
    setTestResult(null);
  }, [modelId]);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        await reload();
        await loadProvider();
      } catch (e) {
        notify("err", e instanceof Error ? e.message : "فشل تحميل تفاصيل الموديل");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelId]);

  // مزامنة شريحة التسعير + الصوت من الملخص — بعد كل تحديث من السيرفر
  useEffect(() => {
    setPriceIn(summary?.priceInMicro ? String(summary.priceInMicro / 1_000_000) : "");
    setPriceOut(summary?.priceOutMicro ? String(summary.priceOutMicro / 1_000_000) : "");
    setFlatProfit(summary?.profitUsdMicro ? String(summary.profitUsdMicro / 1_000_000) : "");
    setCtxNote(summary?.contextNote || "");
    setMargin(String(summary?.costMultiplier ?? 1));
    setVoice(summary?.ttsVoice ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  const savedExists = !!loaded && !loaded.fromEnv;
  const busy = acting || capsBusy || pulling || priceSaving || saving;

  /** PATCH عام على صف الموديل + تحديث الملخص */
  const patchModel = async (body: Record<string, unknown>, okText: string) => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      notify("ok", okText);
      await reload();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setActing(false);
    }
  };

  const savePricing = async () => {
    setPriceSaving(true);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price_in_usd: Number(priceIn.replace(",", ".")) || 0,
          price_out_usd: Number(priceOut.replace(",", ".")) || 0,
          profit_usd: Number(flatProfit.replace(",", ".")) || 0,
          cost_multiplier: Math.min(Math.max(Number(margin.replace(",", ".")) || 1, 1), 50),
          context_note: ctxNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ التسعير");
      await reload();
      notify("ok", "التسعير اتحدّث ✓");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل حفظ التسعير");
    } finally {
      setPriceSaving(false);
    }
  };

  /** سحب التسعير + القدرات + الصيغ من OpenRouter آليًا (موديلات روابط openrouter.ai) */
  const pullFromOpenRouter = async () => {
    setPulling(true);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}/pull`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل السحب");
      const pricing = data.pricing as { known: boolean; priceInUsd: number; priceOutUsd: number; contextNote: string } | undefined;
      notify(
        "ok",
        pricing?.known
          ? `اتسحبت التسعيرة (In $${pricing.priceInUsd} / Out $${pricing.priceOutUsd} لكل مليون) + السياق ${pricing.contextNote || "—"} والقدرات${(data.meta as { provider?: string } | undefined)?.provider ? ` — ${data.meta.provider}` : ""}`
          : "OpenRouter مفيش له سعر معلن للموديل ده — العناصر الباقية اتسحبت، سعّره يدويًا من الشريحة"
      );
      await reload();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل السحب");
    } finally {
      setPulling(false);
    }
  };

  /** تبديل وسوم القدرات — بنبعت الوسوم كاملة والسيرفر بيقبل المسموحة بس.
   * الصف القديم (المحفوظ فاضي) بيبدا من غير وسوم ضمنية: أول تعديل بيخزن الوسوم
   * صريحة، والإزاحة اللي بتفضل القايمة فاضية بتتخزن «none» (فصل متعمد). */
  const patchCaps = async (tag?: string) => {
    if (!summary) return;
    const stored = summary.capabilities.filter((t) => t !== "none");
    const next = tag
      ? stored.includes(tag)
        ? stored.filter((x) => x !== tag)
        : [...stored, tag]
      : stored;
    const caps = next.length ? next : ["none"];
    const legacyNote = summary.capabilities.length === 0 ? " (اتخزنت صريحة بدل السلوك القديم)" : "";
    setCapsBusy(true);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilities: caps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      notify(
        "ok",
        caps[0] === "none"
          ? `مفيش قدرات ${modelId} — القدرات اتقفت عنده فعلًا${legacyNote}`
          : `قدرات ${modelId}: ${caps.join(" · ")}${legacyNote}`
      );
      await reload();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setCapsBusy(false);
    }
  };

  const applyFormats = async () => {
    if (!summary) return;
    const raw = formatsDraft;
    const list = [
      ...new Set(
        raw
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t && FORMATS_ALLOWED.includes(t))
      ),
    ];
    if (list.join(",") === summary.audioFormats.join(",")) return;
    setCapsBusy(true);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_formats: list }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      notify("ok", list.length ? `صيغ صوت ${modelId}: ${list.join(", ")}` : `مسحت صيغ صوت ${modelId}`);
      await reload();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setCapsBusy(false);
    }
  };

  const settingsPayload = () => ({
    modelId,
    name, baseUrl, protocol, model,
    temperature: Number(temperature),
    maxTokens: Number(maxTokens),
    ttsVoice: voice,
  });

  const save = async () => {
    setSaving(true);
    try {
      // بعد أول حفظ: المفاتيح تُدار من كارتها المستقل، والحفظ هنا للإعدادات فقط
      const body = savedExists ? settingsPayload() : { ...settingsPayload(), apiKeys: firstKey };
      const res = await fetch("/api/admin/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setLoaded((prev) => (prev ? { ...prev, active: data.active, fromEnv: false, model: data.model ?? prev.model } : prev));
      setFirstKey("");
      notify("ok", `تم تفعيل مزوّد ${modelId}: ${data.active.name} — ${data.active.model} [${data.active.protocol ?? protocol}]`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body = savedExists
        ? { ...settingsPayload(), savedKeyIndex: 0 }
        : { ...settingsPayload(), apiKeys: firstKey };
      const res = await fetch("/api/admin/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTestResult({ ok: false, text: data.error || "فشل الاتصال", detail: typeof data.detail === "string" ? data.detail : undefined, endpoint: typeof data.endpoint === "string" ? data.endpoint : undefined });
        return;
      }
      setTestResult({ ok: true, text: data.sample ? `شغال [${data.protocol ?? protocol}] — رد الموديل: ${data.sample}` : `شغال [${data.protocol ?? protocol}] — الاتصال ناجح`, endpoint: typeof data.endpoint === "string" ? data.endpoint : undefined });
    } catch {
      setTestResult({ ok: false, text: "مشكلة في الاتصال — حاول تاني" });
    } finally {
      setTesting(false);
    }
  };

  const testKey = async (idx: number) => {
    if (!loaded || testingIdx !== null) return;
    setTestingIdx(idx);
    setRowTest((m) => {
      const next = { ...m };
      delete next[idx];
      return next;
    });
    try {
      const a = loaded.active;
      const res = await fetch("/api/admin/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId,
          name: a.name,
          baseUrl: a.baseUrl,
          protocol: (a as { protocol?: ProviderProtocol }).protocol ?? "chat_completions",
          model: a.model,
          temperature: 0.4,
          maxTokens: 128000,
          savedKeyIndex: idx,
        }),
      });
      const data = await res.json();
      setRowTest((m) => ({
        ...m,
        [idx]: !res.ok || !data.ok
          ? { ok: false, text: data.error || "فشل الاتصال" }
          : { ok: true, text: data.sample ? `شغال — رد الموديل: ${data.sample}` : "شغال — الاتصال ناجح" },
      }));
    } catch {
      setRowTest((m) => ({ ...m, [idx]: { ok: false, text: "مشكلة في الاتصال — حاول تاني" } }));
    } finally {
      setTestingIdx(null);
    }
  };

  const addKey = async () => {
    const key = newKey.trim();
    if (!key || addingKey) return;
    setAddingKey(true);
    try {
      const res = await fetch("/api/admin/provider/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", key, modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإضافة");
      setLoaded((prev) => (prev ? { ...prev, active: data.active } : prev));
      setNewKey("");
      notify("ok", `تمت إضافة المفتاح — بقوا ${data.active.keysCount} مفاتيح`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الإضافة");
    } finally {
      setAddingKey(false);
    }
  };

  const copyKey = async (idx: number) => {
    if (copyingIdx !== null) return;
    setCopyingIdx(idx);
    try {
      const res = await fetch("/api/admin/provider/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal", index: idx, modelId }),
      });
      const data = await res.json();
      if (!res.ok || !data.key) throw new Error(data.error || "فشل النسخ");
      await navigator.clipboard.writeText(String(data.key));
      setCopiedIdx(idx);
      notify("ok", `تم نسخ المفتاح ${idx + 1}`);
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 2000);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل النسخ");
    } finally {
      setCopyingIdx(null);
    }
  };

  const removeKey = async (idx: number) => {
    if (confirmRemove !== idx) {
      setConfirmRemove(idx);
      setTimeout(() => setConfirmRemove((c) => (c === idx ? null : c)), 4000);
      return;
    }
    setConfirmRemove(null);
    setRemovingIdx(idx);
    try {
      const res = await fetch("/api/admin/provider/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", index: idx, modelId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل المسح");
      setLoaded((prev) => (prev ? { ...prev, active: data.active } : prev));
      setRowTest((m) => {
        const next = { ...m };
        delete next[idx];
        return next;
      });
      notify("ok", `تم مسح المفتاح — بقوا ${data.active.keysCount} مفاتيح`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل المسح");
    } finally {
      setRemovingIdx(null);
    }
  };

  const renameModel = async () => {
    const nm = renameValue.trim();
    if (!nm) {
      notify("err", "اسم الموديل لا يمكن أن يكون فارغًا");
      return;
    }
    setActing(true);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      setRenaming(false);
      notify("ok", `تم تغيير اسم الموديل إلى ${nm}`);
      await reload();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setActing(false);
    }
  };

  const deleteModel = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(modelId)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحذف");
      notify("ok", `تم حذف الموديل ${modelId}`);
      setShowDelete(false);
      onBack();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setActing(false);
    }
  };

  if (loading || !loaded) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-3">
        <Loader2 size={18} className="animate-spin text-accent" />
        <span className="text-[13px]">جاري تحميل تفاصيل الموديل…</span>
      </div>
    );
  }

  const masked = loaded.active.maskedKeys ?? [];
  const isVoice = summary?.modality === "tts" || summary?.modality === "stt";
  /** القدرات الظاهرة: المحفوظة صريحة، أو «قراءة صوت» للصف القديم الفاضي (توافق أذن المنصة) */
  const capsOf = (): string[] =>
    summary && summary.capabilities.length
      ? summary.capabilities.filter((t) => t !== "none")
      : summary?.modality === "stt"
        ? ["stt"]
        : [];
  const isLegacyRow = () => summary?.modality === "stt" && (summary?.capabilities.length ?? 0) === 0;

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink"
      >
        <ChevronRight size={14} />
        رجوع لقايمة الموديلات
      </button>

      {/* ——— بطاقة الهوية ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="flex flex-wrap items-start gap-3">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${summary?.modality === "tts" ? "bg-accent-soft text-accent" : summary?.modality === "stt" ? "bg-accent-soft text-accent" : "bg-surface-3 text-ink-2"}`}>
            {summary?.modality === "tts" ? <AudioLines size={20} /> : summary?.modality === "stt" ? <Mic size={20} /> : <MessageSquare size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            {renaming ? (
              <span className="flex items-center gap-1">
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renameModel();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  autoFocus
                  maxLength={60}
                  aria-label="اسم الموديل الجديد"
                  className="h-8 min-w-0 flex-1 rounded-md border border-accent-line bg-surface-2 px-2.5 text-[13.5px] font-semibold text-ink focus:outline-none"
                />
                <button onClick={() => void renameModel()} disabled={acting} title="حفظ الاسم" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-live hover:bg-surface-3 disabled:opacity-40">
                  {acting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                </button>
                <button onClick={() => setRenaming(false)} title="إلغاء" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink">
                  <X size={14} />
                </button>
              </span>
            ) : (
              <p className="flex flex-wrap items-center gap-1.5">
                <span className="text-[15px] font-semibold text-ink">{summary?.name ?? modelId}</span>
                <button
                  onClick={() => {
                    setRenameValue(summary?.name ?? "");
                    setRenaming(true);
                  }}
                  title="تعديل الاسم"
                  className="grid h-6 w-6 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-ink"
                >
                  <Pencil size={12} />
                </button>
                {summary?.modality === "tts" ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent">استوديو الصوت</span>
                ) : summary?.modality === "stt" ? (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent" title="مخفي من الـAPI والشات — بترجم التسجيلات لكل الموديلات">أذن المنصة</span>
                ) : (
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] font-medium text-ink-2">محادثة</span>
                )}
                {summary?.isDefault && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent">افتراضي</span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${summary?.isActive ? "bg-live-soft text-live" : "bg-surface-3 text-ink-3"}`}>
                  {summary?.isActive ? "نشط" : "موقوف"}
                </span>
                {summary?.tier === "paid" ? (
                  <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[10.5px] font-bold text-warn">★ Pro</span>
                ) : (
                  <span className="rounded-full bg-live-soft px-2 py-0.5 text-[10.5px] font-medium text-live">مجاني</span>
                )}
                {(summary?.priceInMicro ?? 0) > 0 || (summary?.priceOutMicro ?? 0) > 0 || (summary?.profitUsdMicro ?? 0) > 0 ? (
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] font-medium text-ink-2">
                    ${fmtPrice(summary?.priceInMicro)} / ${fmtPrice(summary?.priceOutMicro)}
                    {(summary?.profitUsdMicro ?? 0) > 0 ? ` +${fmtPrice(summary?.profitUsdMicro)}` : ""}
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] text-ink-3">بلا تسعير (مجاني)</span>
                )}
              </p>
            )}
            <p className="tnum mt-1 truncate text-[11.5px] text-ink-3" dir="ltr">
              {modelId} · {summary?.keysCount ?? 0} {summary?.keysCount === 1 ? "مفتاح" : "مفاتيح"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void patchModel({ is_active: !(summary?.isActive ?? false) }, summary?.isActive ? `النموذج اتوقف` : `النموذج اتفعّل`)} disabled={busy} title={summary?.isActive ? "إيقاف الموديل" : "تشغيل الموديل"} className={`h-8 w-14 shrink-0 rounded-full px-2 text-[11px] font-medium transition-colors disabled:opacity-40 ${summary?.isActive ? "bg-live-soft text-live hover:bg-live/15" : "bg-surface-3 text-ink-3 hover:bg-surface-2"}`}>
              {acting ? <Loader2 size={13} className="mx-auto animate-spin" /> : summary?.isActive ? "إيقاف" : "تشغيل"}
            </button>
            {!summary?.isDefault && (
              <button onClick={() => void patchModel({ is_default: true }, `بقى الموديل الافتراضي: ${modelId}`)} disabled={busy} title="تعيين كافتراضي" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-3 hover:text-accent disabled:opacity-40">
                <Star size={14} />
              </button>
            )}
            <button onClick={async () => { setLoading(true); try { await reload(); await loadProvider(); } catch (e) { notify("err", e instanceof Error ? e.message : "فشل التحديث"); } finally { setLoading(false); } }} disabled={loading} title="تحديث كل البيانات" className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-hair text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-40">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        {summary?.description && <p className="mt-2.5 border-t border-hair pt-2.5 text-[12px] leading-5 text-ink-2">{summary.description}</p>}
        {summary?.modality === "stt" && (
          <p className="mt-2 rounded-md bg-accent-soft/30 px-3 py-2 text-[11.5px] leading-5 text-ink-2">
            «أذن المنصة» — المترجم العالمي للتسجيلات الصوتية لكل موديلات الشات. مخفي تمامًا من الـAPI الخارجي وقايمة الشات، ومش ممكن حد ينادي عليه مباشرة (403).
          </p>
        )}
      </div>

      {/* ——— خصائص الموديل ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center gap-2">
          <AudioWaveform size={15} className="text-accent" />
          <h2 className="text-[13px] font-semibold text-ink">خصائص الموديل</h2>
        </div>
        <div className="space-y-3">
          {/* الصنف — شات / صوت / أذن */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-ink-2">الصنف:</span>
            {(
              [
                { v: "chat", label: "شات" },
                { v: "tts", label: "توليد صوت" },
                { v: "stt", label: "أذن المنصة" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => void patchModel({ modality: o.v }, o.v === "chat" ? `الموديل بقى للمحادثة` : o.v === "tts" ? `الموديل بقى صوتيًا (TTS)` : `الموديل بقى أذن المنصة (STT)`)}
                disabled={busy || summary?.modality === o.v}
                aria-pressed={summary?.modality === o.v}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-60 ${
                  summary?.modality === o.v ? "bg-accent text-accent-ink" : "border border-hair bg-surface-2 text-ink-2 hover:text-ink"
                }`}
              >
                {o.v === "chat" ? <MessageSquare size={11} /> : o.v === "tts" ? <AudioLines size={11} /> : <Mic size={11} />}
                {o.label}
              </button>
            ))}
          </div>

          {/* التوفر — مجاني للكل أو مدفوع لمشتركين Pro */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-ink-2">التوفر:</span>
            <button
              onClick={() => void patchModel({ tier: "free" }, "الموديل بقى مجاني للكل")}
              disabled={busy || summary?.tier !== "paid"}
              aria-pressed={summary?.tier !== "paid"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-60 ${
                summary?.tier !== "paid" ? "bg-live-soft text-live" : "border border-hair bg-surface-2 text-ink-2 hover:text-ink"
              }`}
            >
              مجاني للكل
            </button>
            <button
              onClick={() => void patchModel({ tier: "paid" }, "الموديل بقى مدفوع — مشتركين Pro بس")}
              disabled={busy || summary?.tier === "paid"}
              aria-pressed={summary?.tier === "paid"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors disabled:opacity-60 ${
                summary?.tier === "paid" ? "bg-warn-soft text-warn" : "border border-hair bg-surface-2 text-ink-2 hover:text-ink"
              }`}
            >
              <Crown size={11} />
              مدفوع — مشتركين Pro بس
            </button>
          </div>

          {/* مزايا الشات — مايك + فيديو */}
          {!isVoice && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-ink-2">مزايا:</span>
              <button
                onClick={() => void patchModel({ supports_mic: !(summary?.supportsMic ?? false) }, (summary?.supportsMic ?? false) ? `المايك OFF للموديل` : `المايك ON للموديل`)}
                disabled={busy}
                title="المايك (تسجيل صوتي → نص) on/off لهذا الموديل"
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  summary?.supportsMic ? "bg-accent-soft text-accent" : "border border-hair bg-surface-2 text-ink-3 hover:text-ink-2"
                }`}
              >
                {capsBusy ? <Loader2 size={11} className="animate-spin" /> : <Mic size={11} />}
                المايك {summary?.supportsMic ? "ON" : "OFF"}
              </button>
              <button
                onClick={() => void patchModel({ supports_video: !(summary?.supportsVideo ?? false) }, (summary?.supportsVideo ?? false) ? `Native video OFF (frames fallback)` : `Native video ON`)}
                disabled={busy}
                title="native video on/off (Gemini-class models)"
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                  summary?.supportsVideo ? "bg-live-soft text-live" : "border border-hair bg-surface-2 text-ink-3 hover:text-ink-2"
                }`}
              >
                {capsBusy ? <Loader2 size={11} className="animate-spin" /> : null}
                <span className="text-[11px] font-bold">VID</span> {summary?.supportsVideo ? "ON" : "OFF"}
              </button>
            </div>
          )}

          {/* قدرات الصوت — للصفوف الصوتية */}
          {isVoice && (
            <div className="space-y-2.5 border-t border-hair pt-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => void pullFromOpenRouter()}
                  disabled={busy}
                  title="سحب قدرات وصيغ الموديل آليًا من OpenRouter (بيشتغل مع روابط openrouter.ai)"
                  className="flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[10.5px] font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
                >
                  {pulling ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  اسحب القدرات من OpenRouter
                </button>
                <span className="text-[10.5px] font-medium text-ink-3">القدرات:</span>
                {/* صف الاستوديو (tts): «توليد صوت» قدرته الأساسية المقفولة — والباقي نسخ صوتي */}
                {summary?.modality === "tts" && (
                  <span
                    title="قدرته الأساسية — النموذج نفسه توليد صوت، وهو اللي داخله في الفلتر من الأساس"
                    className="flex cursor-default items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent"
                  >
                    <Check size={11} strokeWidth={3} />
                    توليد صوت
                  </span>
                )}
                {(summary?.modality === "tts" ? CAPS.filter((c) => c.tag === "clone") : CAPS).map((c) => {
                  const on = capsOf().includes(c.tag);
                  return (
                    <button
                      key={c.tag}
                      onClick={() => void patchCaps(c.tag)}
                      disabled={busy}
                      title={c.hint}
                      aria-pressed={on}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        on ? "bg-accent-soft text-accent" : "bg-surface-3 text-ink-3 hover:text-ink-2"
                      }`}
                    >
                      {capsBusy ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : on ? (
                        <Check size={11} strokeWidth={3} />
                      ) : (
                        <Plus size={11} />
                      )}
                      {c.label}
                    </button>
                  );
                })}
                {isLegacyRow() && (
                  <span className="text-[10.5px] text-ink-3" title="المحفوظ فاضي — بيتعامل كـ«قراءة صوت» للتوافق؛ أول تعديل بيخزن الوسوم صريحة">
                    سلوك قديم — أول تعديل بيخزن صريح
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10.5px] font-medium text-ink-3">صيغ الصوت:</span>
                <input
                  value={formatsDraft}
                  onChange={(e) => setFormatsDraft(e.target.value)}
                  onBlur={() => void applyFormats()}
                  onKeyDown={(e) => { if (e.key === "Enter") void applyFormats(); }}
                  placeholder="mp3,pcm"
                  dir="ltr"
                  title="صيغ الصوت اللي النموذج بيقبلها/بيطلعها — مفصولة بفواصل"
                  className="h-7 w-56 rounded-md border border-hair bg-surface-2 px-2 text-left font-mono text-[11px] text-ink placeholder:text-ink-3 focus:border-accent-line focus:outline-none"
                />
              </div>
              <p className="text-[11px] leading-5 text-ink-3">
                فعّل بس اللي النموذج بيدعمه فعلاً حسب صفحته على المزوّد — والقدرة اللي مش مفعلة بتتمنع من الاستخدام تلقائيًا.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ——— تسعير الموديل (تحديث ١٩/١٩.١) ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <DollarSign size={15} className="text-warn" />
            <h2 className="text-[13px] font-semibold text-ink">تسعير الموديل</h2>
          </div>
          <button
            onClick={() => void pullFromOpenRouter()}
            disabled={busy}
            title="سحب التسعيرة تلقائيًا من OpenRouter لو الموديل عليه سعر معلن"
            className="flex items-center gap-1 rounded-md border border-hair bg-surface-2 px-2 py-1.5 text-[11px] font-medium text-ink-2 hover:border-accent-line hover:text-accent disabled:opacity-40"
          >
            {pulling ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            اسحب من OpenRouter
          </button>
        </div>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[12px] text-ink-2">
                سعر الإدخال ($ لكل مليون) — In
              </label>
              <input
                value={priceIn}
                onChange={(e) => setPriceIn(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                dir="ltr"
                placeholder="مثال: 4"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-2">
                سعر الإخراج ($ لكل مليون) — Out
              </label>
              <input
                value={priceOut}
                onChange={(e) => setPriceOut(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                dir="ltr"
                placeholder="مثال: 20"
                className={INPUT_CLS}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-warn">
              ربحك الثابت ($ لكل مليون وحدة) — بيتضاف فوق التكلفة تلقائيًا
            </label>
            <input
              value={flatProfit}
              onChange={(e) => setFlatProfit(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              dir="ltr"
              placeholder="مثال: 5"
              className={INPUT_CLS}
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-[12px] text-ink-2">
                هامش الربح (×N على التكلفة — 1 إلى 50)
              </label>
              <input
                value={margin}
                onChange={(e) => setMargin(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                dir="ltr"
                placeholder="مثال: 2"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] text-ink-2">
                ملاحظة السياق (للعرض — مثال: 1.0M)
              </label>
              <input
                value={ctxNote}
                onChange={(e) => setCtxNote(e.target.value)}
                dir="ltr"
                placeholder="مثال: 1.0M"
                className={INPUT_CLS}
              />
            </div>
          </div>
          <p className="text-[11.5px] leading-5 text-ink-3">
            الخصم النهائي = (سعر In/Out لكل مليون — بتخليه من سحب OpenRouter أو يدوي) × هامش ×N
            + الربح الثابت. سيب الأسعار فاضيين لو الموديل مجاني.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={savePricing}
              disabled={busy}
              className="flex items-center gap-2 rounded-md bg-accent-soft px-3.5 py-2 text-[12.5px] font-semibold text-accent transition-colors hover:bg-accent-hover disabled:opacity-40"
            >
              {priceSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              {priceSaving ? "جاري الحفظ…" : "حفظ التسعير"}
            </button>
          </div>
        </div>
      </div>

      {/* ——— مزوّد الموديل (الحالي) ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlugZap size={15} className="text-accent" />
            <h2 className="text-[13px] font-semibold text-ink">مزوّد الموديل</h2>
          </div>
          <button onClick={() => void loadProvider()} title="تحديث" className="rounded-md border border-hair bg-surface p-2 text-ink-2 hover:text-accent">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="text-ink-3">الاسم</span>
            <span className="font-medium text-ink">{loaded.active.name}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="shrink-0 text-ink-3">البروتوكول</span>
            <span className="tnum text-ink" dir="ltr">{(loaded.active as { protocol?: string }).protocol === "responses" ? "Responses API" : "Chat Completions"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="shrink-0 text-ink-3">الرابط</span>
            <span className="tnum truncate text-ink" dir="ltr">{loaded.active.baseUrl}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="shrink-0 text-ink-3">الموديل</span>
            <span className="tnum truncate text-ink" dir="ltr">{loaded.active.model}</span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="text-ink-3">المفاتيح</span>
            <span className="tnum text-ink" dir="ltr">
              {loaded.active.keysCount > 0 ? `${loaded.active.keysCount} ${loaded.active.keysCount === 1 ? "مفتاح" : "مفاتيح"}` : "مفيش مفاتيح"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="shrink-0 text-ink-3">هامش الربح</span>
            <span className="tnum text-ink" dir="ltr">×{summary?.costMultiplier ?? 1}</span>
          </div>
          {loaded.fromEnv && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-[12px] leading-5 text-warn">
              شغال حاليًا من متغيرات البيئة — احفظ إعداد من هنا عشان تتحكم فيه من اللوحة بعد كده.
            </p>
          )}
        </div>
      </div>

      {/* ——— مفاتيح الـ API ——— */}
      {savedExists && (
        <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
          <div className="mb-1 flex items-center gap-2">
            <KeyRound size={15} className="text-accent" />
            <h2 className="text-[13px] font-semibold text-ink">مفاتيح الـ API</h2>
            <span className="tnum rounded-full bg-surface-3 px-2 py-0.5 text-[11.5px] text-ink-2" dir="ltr">
              {loaded.active.keysCount}
            </span>
          </div>
          <p className="mb-3 text-[12px] leading-5 text-ink-3">
            ضيف مفاتيح زي ما انت عايز — لو مفتاح خلص أو اترفض، النظام بيقلب تلقائيًا على اللي بعده من غير ما تتدخل. المفاتيح محفوظة على السيرفر بس وبتظهر متخفية.
          </p>

          <div className="space-y-2">
            {masked.map((m, i) => (
              <div key={`${m}-${i}`} className="rounded-md border border-hair bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-medium text-ink-2">
                    {i + 1}
                  </span>
                  <span className="tnum min-w-0 flex-1 truncate text-[12.5px] text-ink" dir="ltr">{m}</span>
                  <button
                    onClick={() => copyKey(i)}
                    disabled={testingIdx !== null || removingIdx !== null || copyingIdx !== null}
                    title="نسخ المفتاح كاملًا"
                    aria-label={`نسخ المفتاح ${i + 1}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-40"
                  >
                    {copyingIdx === i ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : copiedIdx === i ? (
                      <Check size={13} className="text-live" />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                  <button
                    onClick={() => testKey(i)}
                    disabled={testingIdx !== null || removingIdx !== null}
                    title="اختبار المفتاح ده"
                    aria-label={`اختبار المفتاح ${i + 1}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-3 hover:text-accent disabled:opacity-40"
                  >
                    {testingIdx === i ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                  </button>
                  <button
                    onClick={() => removeKey(i)}
                    disabled={testingIdx !== null || removingIdx !== null}
                    title={confirmRemove === i ? "اضغط تاني للتأكيد" : "مسح المفتاح"}
                    aria-label={confirmRemove === i ? `تأكيد مسح المفتاح ${i + 1}` : `مسح المفتاح ${i + 1}`}
                    className={`flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium transition-colors disabled:opacity-40 ${confirmRemove === i ? "bg-danger-soft text-danger" : "text-ink-3 hover:bg-danger-soft hover:text-danger"}`}
                  >
                    {removingIdx === i ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={13} />
                        {confirmRemove === i && <span>تأكيد؟</span>}
                      </>
                    )}
                  </button>
                </div>
                {rowTest[i] && (
                  <p className={`mt-1.5 rounded-md px-2.5 py-1.5 text-[12px] leading-5 ${rowTest[i].ok ? "bg-live-soft text-live" : "bg-danger-soft text-danger"}`} dir="auto">
                    {rowTest[i].text}
                  </p>
                )}
              </div>
            ))}

            <div className="flex gap-2">
              <input
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void addKey(); }}
                placeholder="الصق مفتاح جديد هنا…"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT_CLS} tnum flex-1`}
              />
              <button
                onClick={addKey}
                disabled={addingKey || !newKey.trim()}
                className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
              >
                {addingKey ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                إضافة مفتاح
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— تغيير مزوّد الموديل ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <h2 className="mb-1 text-[13px] font-semibold text-ink">تغيير مزوّد الموديل</h2>
        <p className="mb-3 text-[12px] leading-5 text-ink-3">
          التعليمات وشخصية MALG والبحث والتخزين ثابتين — اللي بيتغيّر بس البروتوكول والرابط والموديل.
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => { setName(p.name); setBaseUrl(p.baseUrl); setModel(p.model); setProtocol(p.protocol); }}
              className="rounded-full border border-hair bg-surface-2 px-2.5 py-1 text-[11.5px] text-ink-2 hover:border-accent-line hover:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">اسم المزوّد (للعرض بس)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: DeepSeek" className={INPUT_CLS} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">بروتوكول الـ API</label>
            <select value={protocol} onChange={(e) => setProtocol(e.target.value === "responses" ? "responses" : "chat_completions")} className={`${INPUT_CLS} tnum`} dir="ltr">
              {PROTOCOL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-ink-3">{PROTOCOL_OPTIONS.find((o) => o.value === protocol)?.hint}</p>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">رابط الـ API (Base URL — المسار النهائي بيتبني حسب البروتوكول)</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" dir="ltr" className={`${INPUT_CLS} tnum`} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">اسم الموديل (زي ما المزوّد مسمّيه بالظبط)</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" dir="ltr" className={`${INPUT_CLS} tnum`} />
          </div>
          {summary?.modality === "stt" && (
            <div className="rounded-md border border-accent-line bg-accent-soft/30 px-3 py-2.5 text-[12px] leading-5 text-ink-2">
              <p className="font-medium text-ink">موديل إدخال صوتي — «أذن المنصة»</p>
              <p className="mt-1">
                لو بتستخدم OpenRouter حط
                <span dir="ltr" className="mx-1 font-mono">https://openrouter.ai/api/v1</span>وموديل مثل
                <span dir="ltr" className="mx-1 font-mono">fish-audio/s2.1-pro-free:free</span>ومفتاح OpenRouter.
              </p>
            </div>
          )}
          {summary?.modality === "tts" && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-2">الصوت الافتراضي (Voice — مثال: alloy)</label>
              <input value={voice} onChange={(e) => setVoice(e.target.value)} placeholder="alloy" dir="ltr" className={`${INPUT_CLS} tnum`} />
              <p className="mt-1 text-[11.5px] text-ink-3">بيتبعت مع كل طلب توليد صوت — سيبه فاضي لصوت المزوّد الافتراضي. بيتحفظ مع زر «حفظ وتفعيل».</p>
            </div>
          )}
          {!savedExists && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-2">مفتاح API الأول (بيتخزن على السيرفر بس)</label>
              <input value={firstKey} onChange={(e) => setFirstKey(e.target.value)} placeholder="sk-...." dir="ltr" autoComplete="off" spellCheck={false} className={`${INPUT_CLS} tnum`} />
              <p className="mt-1 text-[11.5px] text-ink-3">بعد أول حفظ، هتدير كل المفاتيح (إضافة/مسح/اختبار) من كارت المفاتيح فوق.</p>
            </div>
          )}
          <div className="flex gap-2.5">
            <div className="flex-1">
              <label className="mb-1 block text-[12px] text-ink-2">الحرارة (0 - 2)</label>
              <input value={temperature} onChange={(e) => setTemperature(e.target.value)} inputMode="decimal" dir="ltr" className={`${INPUT_CLS} tnum`} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[12px] text-ink-2">أقصى توكنز للرد</label>
              <input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} inputMode="numeric" dir="ltr" className={`${INPUT_CLS} tnum`} />
            </div>
          </div>

          {testResult && (
            <div className={`rounded-md px-3 py-2 text-[12.5px] leading-5 ${testResult.ok ? "bg-live-soft text-live" : "bg-danger-soft text-danger"}`}>
              <p dir="auto">{testResult.text}</p>
              {testResult.endpoint && (
                <p className="mt-1 break-all text-[11px]" dir="ltr">
                  <span className="font-semibold">Endpoint:</span> {testResult.endpoint}
                </p>
              )}
              {testResult.detail && (
                <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded bg-black/5 p-2 text-[11px] leading-4 text-ink" dir="ltr">
                  {testResult.detail}
                </pre>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {summary?.modality === "tts" ? (
              <p className="flex-1 rounded-md bg-surface-2 px-3 py-2.5 text-[12.5px] leading-5 text-ink-3">
                زرار الاختبار للمحادثة فقط — لموديلات الصوت جرّب التوليد الحقيقي من «استوديو الصوت».
              </p>
            ) : (
              <button
                onClick={test}
                disabled={testing || saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-md border border-hair bg-surface-2 py-2.5 text-[13.5px] font-semibold text-ink hover:border-accent-line hover:text-accent disabled:opacity-40"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                {testing ? "جاري الاختبار…" : "اختبار الاتصال"}
              </button>
            )}
            <button
              onClick={save}
              disabled={saving || testing}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent py-2.5 text-[13.5px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "جاري الحفظ…" : "حفظ وتفعيل"}
            </button>
          </div>
        </div>
      </div>

      {/* ——— منطقة الخطر ——— */}
      <div className="rounded-lg border border-danger/30 bg-surface p-4 shadow-1">
        <h2 className="text-[13px] font-semibold text-danger">منطقة الخطر</h2>
        <p className="mt-1 mb-2.5 text-[12px] leading-5 text-ink-2">
          حذف الموديل بيمسح إعداده ومفاتيحه نهائيًا — والمستخدمين اللي بيستخدموه هيختفي من عندهم فورًا.
        </p>
        <button
          onClick={() => setShowDelete(true)}
          className="flex items-center gap-1.5 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] font-semibold text-danger transition-colors hover:brightness-95"
        >
          <Trash2 size={13} />
          حذف الموديل نهائيًا
        </button>
      </div>

      {showDelete && summary && (
        <ConfirmModal
          danger
          title="حذف الموديل"
          message={`متأكد إنك عايز تحذف «${summary.name}» (${modelId})؟ المسح نهائي ومفيش رجوع — الإعدادات والمفاتيح بتمسح كلها.`}
          confirmLabel="حذف نهائي"
          onClose={() => setShowDelete(false)}
          onConfirm={deleteModel}
        />
      )}
    </div>
  );
}
