"use client";

import { useCallback, useEffect, useState } from "react";
import { AudioLines, Check, Info, Loader2, Mic, Plus, RefreshCw, Trash2 } from "lucide-react";

interface Row {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  keysCount: number;
  /** الصنف: stt = أذن المنصة (ترجمة التسجيلات)، tts = استوديو الصوت (توليد صوت) */
  modality: string;
  /** القدرات المحفوظة (وسوم CSV محلولة) — فاضية = توافق قديم بيتعامل كـ stt لأذن المنصة */
  capabilities: string[];
  /** صيغ الصوت المدعومة (CSV محلولة — مثال: mp3,pcm) */
  audioFormats: string[];
}

/** قدرات النموذج الصوتي — فعّل اللي النموذج بيدعمه فعلاً حسب صفحته على المزوّد */
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
    hint: "يظهر في استوديو الصوت كمحرك تحويل نص إلى صوت",
  },
  {
    tag: "clone",
    label: "نسخ صوتي",
    hint: "بيسمح بإرفاق عينة صوتية في الاستوديو لتقليد الصوت (لازم النموذج يدعمها)",
  },
];

/** صيغ الصوت المسموحة — نسخة من AUDIO_FORMATS_ALLOWED (lib/provider.ts) بدون استيراد شات سيرفر */
const FORMATS_ALLOWED = ["mp3", "pcm", "wav", "opus", "m4a", "flac", "webm", "aac"];

/**
 * إدارة «النماذج الصوتية» — أذن المنصة + استوديو الصوت.
 * النموذج الصوتي بيسحب قدراته كوسوم مستقلة: قراءة صوت (STT) /
 * تفريغ (transcriptions) / توليد صوت (TTS) / نسخ صوتي (clone) —
 * كل قدرة بتشتغل لوحدها، والقدرات اللي مش مدعومة من النموذج متتفعلش.
 * الرابط/الموديل/المفاتيح بتتعدل من صفه في تبويب «الموديلات والمزوّدون».
 */
export default function AdminVoiceModels({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  /** صنف الموديل الجديد: stt = أذن المنصة، tts = استوديو الصوت (توليد صوت) */
  const [kind, setKind] = useState<"stt" | "tts">("stt");
  const [actingId, setActingId] = useState<string | null>(null);
  const [capsBusy, setCapsBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [formatsDraft, setFormatsDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/models");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحميل القايمة");
      const all = (Array.isArray(data.models) ? data.models : []) as (Row & { modality?: unknown })[];
      setRows(
        all
          .filter((m) => m.modality === "stt" || m.modality === "tts")
          .map((m) => ({
            ...m,
            modality: m.modality === "tts" ? "tts" : "stt",
            capabilities: Array.isArray(m.capabilities) ? m.capabilities.filter((t) => typeof t === "string") : [],
            audioFormats: Array.isArray(m.audioFormats) ? m.audioFormats.filter((t) => typeof t === "string") : [],
          }))
          .sort((a, b) => (a.modality === b.modality ? 0 : a.modality === "stt" ? -1 : 1))
      );
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحميل");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      // النموذج بيتولد بقدرته الأساسية مفعّلة (stt للأذن / tts للاستوديو)
      const body: Record<string, unknown> = { name: name.trim(), modality: kind, capabilities: [kind] };
      const s = slug.trim();
      if (s) body.id = s;
      const res = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإنشاء");
      notify(
        "ok",
        kind === "stt"
          ? "الموديل اتعمل بقدرة «قراءة صوت» — كمّل ضبط الرابط والموديل والمفتاح من «الموديلات والمزوّدون»"
          : "الموديل اتعمل بقدرة «توليد صوت» — كمّل ضبط الرابط والموديل والمفتاح من «الموديلات والمزوّدون»"
      );
      setName("");
      setSlug("");
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الإنشاء");
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (id: string, next: boolean) => {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      notify("ok", next ? `موديل الصوت ${id} اتفعّل` : `موديل الصوت ${id} اتوقّف`);
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setActingId(null);
    }
  };

  const remove = async (id: string) => {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحذف");
      notify("ok", `موديل الصوت ${id} اتمسح`);
      setConfirmDel(null);
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setActingId(null);
    }
  };

  /** تحديث قدرات صف — البيعة بتبعت الوسوم الجديدة كاملة والسيرفر بيقبل المسموحة بس.
   * الصف القديم لأذن المنصة (المحفوظ فاضي) بيبدا من غير وسوم ضمنية: أول تعديل
   * بيخزن الوسوم صريحة، والإزاحة اللي بتفضل القايمة فاضية بتتخزن «none» (فصل متعمد). */
  const patchCaps = async (row: Row, tag?: string) => {
    const stored = row.capabilities.filter((t) => t !== "none");
    const next = tag
      ? stored.includes(tag)
        ? stored.filter((x) => x !== tag)
        : [...stored, tag]
      : stored;
    const caps = next.length ? next : ["none"];
    const legacyNote = row.capabilities.length === 0 ? " (اتخزنت صريحة بدل السلوك القديم)" : "";
    setCapsBusy(row.id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capabilities: caps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      notify(
        "ok",
        caps[0] === "none"
          ? `مفيش قدرات ${row.id} — قراءة الصوت اتقفت عنده فعلًا${legacyNote}`
          : `قدرات ${row.id}: ${caps.join(" · ")}${legacyNote}`
      );
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setCapsBusy(null);
    }
  };

  /** سحب قدرات الصف من OpenRouter آليًا (هندسة الصف: openrouter فقط) — بيكتب الوسوم والصيغ صريحة */
  const pullCaps = async (row: Row) => {
    setCapsBusy(row.id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(row.id)}/pull`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل السحب");
      const caps: string[] = Array.isArray(data.capabilities) ? data.capabilities : [];
      const meta = data.meta as { supportsVoiceCloning?: boolean; provider?: string } | undefined;
      notify(
        "ok",
        caps.length && caps[0] !== "none"
          ? `قدرات ${row.id} اتسحبت من OpenRouter${meta?.provider ? ` (${meta.provider})` : ""}: ${caps.join(" · ")}`
          : `OpenRouter معرفش قدرات صوت لـ${row.id} — اتخزنت «مفيش قدرات»`
      );
      setFormatsDraft((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل السحب");
    } finally {
      setCapsBusy(null);
    }
  };

  const applyFormats = async (row: Row) => {
    const raw = formatsDraft[row.id] ?? row.audioFormats.join(",");
    const list = [
      ...new Set(
        raw
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t && FORMATS_ALLOWED.includes(t))
      ),
    ];
    if (list.join(",") === row.audioFormats.join(",")) return;
    setCapsBusy(row.id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_formats: list }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      notify("ok", list.length ? `صيغ صوت ${row.id}: ${list.join(", ")}` : `مسحت صيغ صوت ${row.id}`);
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setCapsBusy(null);
    }
  };

  /** القدرات الظاهرة على الشيب: المحفوظة صريحة، أو «قراءة صوت» للصف القديم الفاضي (توافق أذن المنصة بس) */
  const capsOf = (m: Row): string[] =>
    m.capabilities.length ? m.capabilities.filter((t) => t !== "none") : m.modality === "stt" ? ["stt"] : [];
  /** الصف القديم (أذن المنصة بس): قدراته المحفوظة فعلاً فاضية (مش none صريح) — أول تعديل هيعاد تخزينها */
  const isLegacyRow = (m: Row): boolean => m.modality === "stt" && m.capabilities.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ——— شرح الفكرة ——— */}
      <div className="rounded-lg border border-accent-line bg-accent-soft/30 p-4">
        <div className="flex items-start gap-2.5">
          <Mic size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">
            <p className="font-semibold text-ink">النماذج الصوتية — كل نموذج بيسحب قدراته</p>
            <p>
              كل نموذج صوتي بيتضيفه الأدمن بيسحب قدراته كوسوم مستقلة، وكل قدرة بتشتغل لوحدها:
              <span className="font-medium text-ink"> قراءة صوت</span> = مترجم الرسايل الصوتية لكل موديلات الشات،
              <span className="font-medium text-ink"> تفريغ صوتي</span> = نفس الشغل عبر endpoint التفريغ
              (موديلات whisper)،<span className="font-medium text-ink"> توليد صوت</span> = بيظهر في استوديو الصوت
              (نص ← صوت)، ونسخ صوتي = بيسمح بعينة مرجعية لتقليد الصوت في الاستوديو. الصفوف من نوع «استوديو
              الصوت» (توليد صوت) بتظهر هنا كمان وبتسحب قدراتها (النسخ + الصيغ) بنفس الطريقة.
            </p>
            <p className="text-ink-3">
              فعّل اللي النموذج بيدعمه فعلاً حسب صفحته على OpenRouter — واللي مش مدعوم سيبه مطفي.
              الصف اللي كل قدراته فاضية بيتعامل كأنه «قراءة صوت» — توافق مع الموديلات القديمة،
              وأول تعديل على الوسوم بيخزنها صريحة (تتخزن «مفيش قدرات» لو قفلتها كلها).
            </p>
            <p className="text-ink-3">
              الخصوصية: النماذج دي مخفية تمامًا — مش بتظهر في API خارجي ولا قايمة شات الموقع، ومش ممكن أي حد
              ينادي عليها مباشرة (403).
            </p>
          </div>
        </div>
      </div>

      {/* ——— خطوات الضبط ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4">
        <div className="flex items-start gap-2.5">
          <Info size={15} className="mt-0.5 shrink-0 text-ink-3" />
          <div className="space-y-1 text-[12px] leading-relaxed text-ink-2">
            <p className="font-medium text-ink">الإعداد بنقطة واحدة</p>
            <p>
              1. أضف موديل هنا بعد اختيار صنفه (أذن = ترجمة التسجيلات، استوديو = توليد صوت — الـid بيتولد لوحد).
              <br />
              2. افتح تبويب «الموديلات والمزوّدون» واختار الصف، وبنموذج المزوّد حط قيم OpenRouter:
              <br />
              <span dir="ltr" className="mx-1 inline-block rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px]">
                https://openrouter.ai/api/v1
              </span>
              + موديل مثل
              <span dir="ltr" className="mx-1 inline-block rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[11px]">
                fish-audio/s2.1-pro-free:free
              </span>
              + مفتاح OpenRouter.
              <br />
              3. فعّل قدراته من القايمة تحت (مثال fish-audio: توليد صوت + نسخ صوتي — لو عايز تفريغ استخدم
              موديل whisper وفعّل «تفريغ صوتي») وحدد الصيغ (مثال: mp3,pcm).
              <br />
              4. فعّله من زر التشغيل — أول موديل نشط بالترتيب هو اللي بيتستخدم.
            </p>
          </div>
        </div>
      </div>

      {/* ——— نموذج الإضافة ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4">
        <p className="mb-3 text-[13px] font-semibold">أضف نموذج صوتي جديد</p>
        <div className="mb-2.5 flex items-center gap-1.5">
          {(
            [
              { v: "stt", label: "أذن المنصة", hint: "مترجم التسجيلات الصوتية" },
              { v: "tts", label: "استوديو الصوت", hint: "توليد صوت (نص → صوت) مع النسخ الصوتي" },
            ] as const
          ).map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => setKind(o.v)}
              title={o.hint}
              aria-pressed={kind === o.v}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                kind === o.v ? "bg-accent text-accent-ink" : "bg-surface-3 text-ink-3 hover:text-ink-2"
              }`}
            >
              {o.v === "stt" ? <Mic size={12} /> : <AudioLines size={12} />}
              {o.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "stt" ? "الاسم (مثال: أذن fish-audio)" : "الاسم (مثال: صوت fish-audio)"}
            maxLength={60}
            className="h-9 min-w-0 flex-1 rounded-md border border-hair bg-surface-2 px-3 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent-line focus:outline-none"
          />
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="id (اختياري — لو فاضي هيتولد تلقائي)"
            dir="ltr"
            maxLength={40}
            className="h-9 min-w-0 flex-1 rounded-md border border-hair bg-surface-2 px-3 text-left text-[13px] text-ink placeholder:text-ink-3 focus:border-accent-line focus:outline-none"
          />
          <button
            onClick={() => void create()}
            disabled={creating || !name.trim()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-medium text-accent-ink shadow-accent transition-transform hover:scale-[1.02] disabled:opacity-40"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            إضافة
          </button>
        </div>
      </div>

      {/* ——— القايمة ——— */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-hair bg-surface p-6 text-[13px] text-ink-2">
          <Loader2 size={15} className="animate-spin" />
          بيجيب القايمة…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-hair bg-surface p-6 text-center text-[13px] text-ink-3">
          لا يوجد نماذج صوتية — أضف أول واحد من فوق ↑
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((m) => (
            <div key={m.id} className="rounded-lg border border-hair bg-surface px-3.5 py-3">
              <div className="flex items-center gap-3">
                {m.modality === "tts" ? (
                  <AudioLines size={14} className="shrink-0 text-accent" />
                ) : (
                  <Mic size={14} className="shrink-0 text-accent" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-ink">{m.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        m.modality === "tts" ? "bg-accent-soft text-accent" : "bg-surface-3 text-ink-2"
                      }`}
                    >
                      {m.modality === "tts" ? "استوديو الصوت" : "أذن المنصة"}
                    </span>
                  </p>
                  <p className="tnum mt-0.5 block truncate text-[11.5px] text-ink-3" dir="ltr">
                    {m.id} · {m.keysCount} {m.keysCount === 1 ? "مفتاح" : "مفاتيح"}
                  </p>
                </div>
                {m.isActive ? (
                  <span className="shrink-0 rounded-full bg-live-soft px-2 py-0.5 text-[10.5px] font-medium text-live">
                    نشط
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] font-medium text-ink-3">
                    موقوف
                  </span>
                )}
                <button
                  onClick={() => void toggleActive(m.id, !m.isActive)}
                  disabled={actingId !== null}
                  title={m.isActive ? "إيقاف الموديل" : "تشغيل الموديل"}
                  aria-label={m.isActive ? "إيقاف الموديل" : "تشغيل الموديل"}
                  className={`h-8 w-14 shrink-0 rounded-full px-2 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                    m.isActive ? "bg-live-soft text-live hover:bg-live/15" : "bg-surface-3 text-ink-3 hover:bg-surface-2"
                  }`}
                >
                  {actingId === m.id ? (
                    <Loader2 size={13} className="mx-auto animate-spin" />
                  ) : m.isActive ? (
                    "إيقاف"
                  ) : (
                    "تشغيل"
                  )}
                </button>
                {confirmDel === m.id ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => void remove(m.id)}
                      disabled={actingId !== null}
                      className="rounded-md bg-danger-soft px-2.5 py-1.5 text-[11.5px] font-medium text-danger disabled:opacity-40"
                    >
                      {actingId === m.id ? <Loader2 size={12} className="animate-spin" /> : "متأكد؟ حذف"}
                    </button>
                    <button
                      onClick={() => setConfirmDel(null)}
                      className="rounded-md px-2 py-1.5 text-[11.5px] text-ink-3 hover:text-ink"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDel(m.id)}
                    disabled={actingId !== null}
                    title="حذف موديل الصوت"
                    aria-label={`حذف ${m.name}`}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {/* ——— سطر القدرات + الصيغ ——— */}
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-hair pt-2.5">
                <button
                  onClick={() => void pullCaps(m)}
                  disabled={actingId !== null || capsBusy !== null}
                  title="سحب قدرات وصيغ الموديل آليًا من OpenRouter (بيشتغل مع روابط openrouter.ai)"
                  className="flex items-center gap-1 rounded-md bg-surface-3 px-2 py-1 text-[10.5px] font-medium text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
                >
                  {capsBusy === m.id ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                  اسحب القدرات
                </button>
                <span className="text-[10.5px] font-medium text-ink-3">القدرات:</span>
                {/* صف الخدمة (tts): «توليد صوت» قدرته الأساسية المقفولة — والباقي نسخ صوتي */}
                {m.modality === "tts" && (
                  <span
                    title="قدرته الأساسية — النموذج نفسه توليد صوت، وهو اللي داخله في الفلتر من الأساس"
                    className="flex cursor-default items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent"
                  >
                    <Check size={11} strokeWidth={3} />
                    توليد صوت
                  </span>
                )}
                {(m.modality === "tts" ? CAPS.filter((c) => c.tag === "clone") : CAPS).map((c) => {
                  const on = capsOf(m).includes(c.tag);
                  return (
                    <button
                      key={c.tag}
                      onClick={() => void patchCaps(m, c.tag)}
                      disabled={actingId !== null || capsBusy !== null}
                      title={c.hint}
                      aria-pressed={on}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
                        on ? "bg-accent-soft text-accent" : "bg-surface-3 text-ink-3 hover:text-ink-2"
                      }`}
                    >
                      {capsBusy === m.id ? (
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
                {isLegacyRow(m) && (
                  <span className="text-[10.5px] text-ink-3" title="المحفوظ فاضي — بيتعامل كـ«قراءة صوت» للتوافق؛ أول تعديل بيخزن الوسوم صريحة">
                    سلوك قديم — أول تعديل بيخزن صريح
                  </span>
                )}
                <span className="ms-auto flex items-center gap-1.5">
                  <span className="text-[10.5px] text-ink-3">الصيغ:</span>
                  <input
                    value={formatsDraft[m.id] ?? m.audioFormats.join(",")}
                    onChange={(e) => setFormatsDraft((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    onBlur={() => void applyFormats(m)}
                    placeholder="mp3,pcm"
                    dir="ltr"
                    title="صيغ الصوت اللي النموذج بيقبلها/بيطلعها — مفصولة بفواصل"
                    className="h-6 w-28 rounded-md border border-hair bg-surface-2 px-2 text-left font-mono text-[11px] text-ink placeholder:text-ink-3 focus:border-accent-line focus:outline-none"
                  />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
