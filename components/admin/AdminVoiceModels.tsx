"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, Loader2, Mic, Plus, Trash2 } from "lucide-react";

interface Row {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  keysCount: number;
}

/**
 * إدارة «النماذج الصوتية» (صفوف modality=stt) — أذن المنصة.
 * النموذج هنا بيقري تسجيلات المستخدمين الصوتية ويرجّعها نص لكل موديلات الشات
 * (مترجم فوق in /api/chat) — مخفي تمامًا: مش في الـAPI الخارجي ولا انتقاء الشات
 * ومش ممكن حد يناديه مباشرة (403). الرابط/الموديل/المفاتيح بتعدل من صفه في
 * تبويب «الموديلات والمزوّدون» زي أي موديل تاني.
 */
export default function AdminVoiceModels({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/models");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل تحميل القايمة");
      const all = (Array.isArray(data.models) ? data.models : []) as (Row & { modality?: unknown })[];
      setRows(all.filter((m) => m.modality === "stt"));
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
      const body: Record<string, unknown> = { name: name.trim(), modality: "stt" };
      const s = slug.trim();
      if (s) body.id = s;
      const res = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإنشاء");
      notify("ok", "الموديل اتعمل — كمّل ضبط الرابط والموديل والمفتاح من «الموديلات والمزوّدون»");
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* ——— شرح الفكرة ——— */}
      <div className="rounded-lg border border-accent-line bg-accent-soft/30 p-4">
        <div className="flex items-start gap-2.5">
          <Mic size={16} className="mt-0.5 shrink-0 text-accent" />
          <div className="space-y-1.5 text-[12.5px] leading-relaxed text-ink-2">
            <p className="font-semibold text-ink">النماذج الصوتية — «أذن المنصة»</p>
            <p>
              النموذج اللي هتضيفه بيتحول لمترجم التسجيلات الصوتية لجميع موديلات الشات: أي مستخدم يبعت رسالة
              صوتية لأي موديل، ده يقراها ويحولها نص، والنص يروح للموديل المختار عشان يرد كأن المستخدم كتبه.
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
              1. أضف موديل هنا (اسم يوصفه، الـid بيتولد لوحد).
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
              3. فعّله من زر التشغيل بالقائمة تحت — أول موديل نشط بالترتيب هو اللي بيتستخدم.
            </p>
          </div>
        </div>
      </div>

      {/* ——— نموذج الإضافة ——— */}
      <div className="rounded-lg border border-hair bg-surface p-4">
        <p className="mb-3 text-[13px] font-semibold">أضف نموذج صوتي جديد</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="الاسم (مثال: أذن fish-audio)"
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
            <div
              key={m.id}
              className="flex items-center gap-3 rounded-lg border border-hair bg-surface px-3.5 py-2.5"
            >
              <Mic size={14} className="shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{m.name}</p>
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
                {actingId === m.id ? <Loader2 size={13} className="mx-auto animate-spin" /> : m.isActive ? "إيقاف" : "تشغيل"}
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
          ))}
        </div>
      )}
    </div>
  );
}
