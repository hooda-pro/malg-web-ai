"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AudioLines,
  ChevronDown,
  ChevronUp,
  LayoutList,
  Loader2,
  MessageSquare,
  Mic,
  Plus,
} from "lucide-react";
import type { ModelSummary } from "@/lib/provider";
import { fmtPrice } from "./helpers";

type NotifyFn = (type: "ok" | "err", text: string) => void;
type Tab = "chat" | "tts" | "stt";

/** التابات الثلاثة — كل تاب بيجمع موديلات صنفه (العدد بيتحسب من القايمة كاملة) */
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "chat", label: "شات", hint: "موديلات المحادثة — بتظهر في الشات والـ API الخارجي" },
  { id: "tts", label: "توليد صوت TTS", hint: "استوديو الصوت — تحويل النص لصوت" },
  { id: "stt", label: "أذن المنصة STT", hint: "مترجم التسجيلات الصوتية لكل الموديلات — مخفي من الـ API والشات" },
];

const INPUT_CLS = "w-full rounded-md border border-hair bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none";

/**
 * قايمة الموديلات (تحديث ٢٠) — على نفس نمط المستخدمين: تابات بـ٣ أصناف
 * (شات / توليد صوت / أذن المنصة) والدوس على أي موديل بيفتح صفحة تفاصيل كاملة.
 * كل الإجراءات (تسعير/مزوّد/مفاتيح/قدرات/حذف) جوه صفحة التفاصيل.
 */
export default function AdminModelsList({
  onSelect,
  notify,
}: {
  onSelect: (id: string) => void;
  notify: NotifyFn;
}) {
  const [models, setModels] = useState<ModelSummary[] | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addId, setAddId] = useState("");
  const [addModality, setAddModality] = useState<"chat" | "tts" | "stt">("chat");
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async (): Promise<ModelSummary[]> => {
    const res = await fetch("/api/admin/models");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل تحميل الموديلات");
    const listData = (data.models ?? []) as ModelSummary[];
    setModels(listData);
    return listData;
  }, []);

  useEffect(() => {
    load().catch((e) => setLoadErr(e instanceof Error ? e.message : "فشل تحميل الموديلات"));
  }, [load]);

  const list = models ?? [];
  const countOf = (t: Tab) => list.filter((m) => m.modality === t).length;
  const visible = list.filter((m) => m.modality === tab);

  const addModel = async () => {
    const nm = addName.trim();
    if (!nm || adding) return;
    setAdding(true);
    try {
      // النموذج الصوتي بيتولد بقدرته الأساسية صريحة — زي تدفق «النماذج الصوتية» القديم
      const capabilities =
        addModality === "stt" ? ["stt"] : addModality === "tts" ? ["tts"] : undefined;
      const res = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, id: addId.trim() || undefined, modality: addModality, capabilities }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنشاء الموديل");
      setModels((data.models ?? []) as ModelSummary[]);
      setAddName("");
      setAddId("");
      setShowAdd(false);
      notify("ok", `تم إنشاء «${nm}» — فتح صفحته عشان تكمل إعداده`);
      const createdId = (data.createdId ?? "") as string;
      if (createdId) onSelect(createdId);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل إنشاء الموديل");
    } finally {
      setAdding(false);
    }
  };

  /** تبديل ترتيب صفين ظاهرين في التاب — بتبعت الترتيب الكامل عشان أصناف التابات التانية متتلخبطش */
  const moveVisible = async (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (moving || j < 0 || j >= visible.length) return;
    const aId = visible[idx].id;
    const bId = visible[j].id;
    const next = [...list];
    const a = next.findIndex((m) => m.id === aId);
    const b = next.findIndex((m) => m.id === bId);
    if (a < 0 || b < 0) return;
    [next[a], next[b]] = [next[b], next[a]];
    setModels(next);
    setMoving(true);
    try {
      const res = await fetch("/api/admin/models/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: next.map((m) => m.id) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل حفظ الترتيب");
      notify("ok", "تم حفظ ترتيب الموديلات");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل حفظ الترتيب");
      load().catch(() => undefined);
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ——— التابات الثلاثة ——— */}
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            aria-pressed={tab === t.id}
            className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-colors ${
              tab === t.id ? "bg-accent text-accent-ink shadow-accent" : "border border-hair bg-surface text-ink-2 hover:text-ink"
            }`}
          >
            {t.id === "chat" ? <MessageSquare size={13} /> : t.id === "tts" ? <AudioLines size={13} /> : <Mic size={13} />}
            {t.label}
            <span
              className={`tnum rounded-full px-1.5 py-px text-[10.5px] ${
                tab === t.id ? "bg-black/10 text-accent-ink" : "bg-surface-3 text-ink-3"
              }`}
            >
              {countOf(t.id)}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[12px] leading-5 text-ink-3">
        {TABS.find((t) => t.id === tab)?.hint} — دوس على أي موديل يفتحلك صفحته كاملة: التسعير، المزوّد، المفاتيح، والقدرات.
      </p>

      {/* ——— إضافة موديل ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="flex items-center gap-1.5 rounded-md border border-hair bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:border-accent-line hover:text-accent"
        >
          {showAdd ? <LayoutList size={13} /> : <Plus size={13} />}
          {showAdd ? "إغلاق النموذج" : "موديل جديد"}
        </button>

        {showAdd && (
          <div className="mt-3 space-y-2 rounded-md border border-hair bg-surface-2 p-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="اسم الموديل (مثال: DeepSeek V3)"
                className={INPUT_CLS}
              />
              <input
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                placeholder="id اختياري (إنجليزي)"
                dir="ltr"
                className={`${INPUT_CLS} tnum sm:max-w-[180px]`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-ink-2">النوع:</span>
              {(
                [
                  { v: "chat", label: "شات", icon: <MessageSquare size={11} /> },
                  { v: "tts", label: "توليد صوت", icon: <AudioLines size={11} /> },
                  { v: "stt", label: "أذن المنصة", icon: <Mic size={11} /> },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setAddModality(o.v)}
                  aria-pressed={addModality === o.v}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
                    addModality === o.v ? "bg-accent text-accent-ink" : "border border-hair bg-surface text-ink-2 hover:text-ink"
                  }`}
                >
                  {o.icon}
                  {o.label}
                </button>
              ))}
              {addModality === "stt" && (
                <span className="text-[11px] text-ink-3">أذن المنصة = مترجم التسجيلات لكل الموديلات — مخفي من الـAPI والشات</span>
              )}
            </div>
            <button
              onClick={addModel}
              disabled={adding || !addName.trim()}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              إنشاء الموديل
            </button>
          </div>
        )}
      </div>

      {/* ——— القايمة ——— */}
      {loadErr ? (
        <div className="rounded-lg border border-hair bg-surface p-6 text-center text-[13px] text-danger">
          {loadErr}
          <button onClick={() => void load()} className="ms-2 rounded-md bg-accent-soft px-3 py-1.5 text-[12px] font-semibold text-accent">
            إعادة المحاولة
          </button>
        </div>
      ) : !models ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-hair bg-surface p-6 text-[13px] text-ink-2">
          <Loader2 size={15} className="animate-spin text-accent" />
          بيجيب القايمة…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-hair bg-surface p-6 text-center text-[13px] text-ink-3">
          مفيش موديلات في التصنيف «{TABS.find((t) => t.id === tab)?.label}» — أضف واحد من فوق ↑ أو حوّل صف موجود من صفحته.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((m, idx) => (
            <div key={m.id} className="flex items-center gap-2 rounded-lg border border-hair bg-surface px-3.5 py-3 transition-colors hover:border-accent-line">
              {m.modality === "tts" ? (
                <AudioLines size={14} className="shrink-0 text-accent" />
              ) : m.modality === "stt" ? (
                <Mic size={14} className="shrink-0 text-accent" />
              ) : (
                <MessageSquare size={14} className="shrink-0 text-ink-3" />
              )}
              <button onClick={() => onSelect(m.id)} title={`فتح تفاصيل ${m.name}`} className="min-w-0 flex-1 text-start">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="truncate text-[13px] font-semibold text-ink">{m.name}</span>
                  {m.isDefault && (
                    <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">
                      افتراضي
                    </span>
                  )}
                  {!m.isActive && (
                    <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] font-medium text-ink-3">
                      موقوف
                    </span>
                  )}
                  {m.tier === "paid" ? (
                    <span className="shrink-0 rounded-full bg-warn-soft px-1.5 py-px text-[10.5px] font-bold text-warn">
                      ★ Pro
                    </span>
                  ) : null}
                  {(m.costMultiplier ?? 1) > 1 && (
                    <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] font-medium text-ink-2" title="هامش الربح">
                      ×{m.costMultiplier}
                    </span>
                  )}
                  {(m.priceInMicro ?? 0) > 0 || (m.priceOutMicro ?? 0) > 0 || (m.profitUsdMicro ?? 0) > 0 ? (
                    <span className="shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] font-medium text-ink-2" title="In/Out (+ربح ثابت) بالدولار لكل مليون">
                      ${fmtPrice(m.priceInMicro)} / ${fmtPrice(m.priceOutMicro)}
                      {(m.profitUsdMicro ?? 0) > 0 ? ` +${fmtPrice(m.profitUsdMicro)}` : ""}
                    </span>
                  ) : null}
                  {m.supportsVideo === true && (
                    <span className="shrink-0 rounded-full bg-live-soft px-1.5 py-px text-[10.5px] font-medium text-live">VID</span>
                  )}
                  {m.supportsMic === true && (
                    <span className="shrink-0 rounded-full bg-accent-soft px-1.5 py-px text-[10.5px] font-medium text-accent">MIC</span>
                  )}
                </span>
                <span className="tnum mt-0.5 block truncate text-[11.5px] text-ink-3" dir="ltr">
                  {m.id} · {m.keysCount} {m.keysCount === 1 ? "مفتاح" : "مفاتيح"}
                </span>
              </button>
              <span className="tnum shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent" title="فتح التفاصيل">
                تفاصيل ←
              </span>
              <span className="flex shrink-0 flex-col" role="group" aria-label="تغيير الترتيب">
                <button
                  onClick={() => void moveVisible(idx, -1)}
                  disabled={moving || idx === 0}
                  title="حرّك فوق"
                  aria-label={`حرّك ${m.name} فوق`}
                  className="grid h-4 w-6 place-items-center rounded text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30"
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  onClick={() => void moveVisible(idx, 1)}
                  disabled={moving || idx >= visible.length - 1}
                  title="حرّك تحت"
                  aria-label={`حرّك ${m.name} تحت`}
                  className="grid h-4 w-6 place-items-center rounded text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30"
                >
                  <ChevronDown size={12} />
                </button>
              </span>
            </div>
          ))}
          <p className="pt-1 text-[11.5px] text-ink-3">
            الأسهم بتغيّر ترتيب الظهور (نفس الترتيب اللي بيظهر للمستخدمين) — الترتيب بيتحفظ تلقائيًا.
          </p>
        </div>
      )}
    </div>
  );
}
