"use client";

import { useEffect, useState } from "react";
import { Button, Field, Panel } from "./ui/Controls";

interface Fact {
  id: string;
  fact: string;
  category: string;
  createdAt: string;
}

const CATEGORIES = ["عام", "عمل", "برمجة", "تفضيلات"] as const;

export default function FactsManager() {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [fact, setFact] = useState("");
  const [category, setCategory] = useState<string>("عام");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/facts", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر تحميل الحقائق");
      setFacts(j.facts ?? []);
    } catch (e: any) {
      setError(e?.message || "تعذّر تحميل الحقائق");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    const f = fact.trim();
    if (!f || f.length > 300) {
      setError("الحقيقة مطلوبة (حتى 300 حرف)");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fact: f, category }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر الإضافة");
      setFacts((prev) => [j.fact, ...prev].slice(0, 100));
      setFact("");
    } catch (e: any) {
      setError(e?.message || "تعذّر الإضافة");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      const r = await fetch(`/api/facts/${id}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر الحذف");
      setFacts((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      setError(e?.message || "تعذّر الحذف");
    }
  }

  return (
    <div className="rounded-xl border border-hair bg-surface p-4 text-ink">
      <h3 className="mb-1 text-[15px] font-semibold">حقائق عنك</h3>
      <p className="mb-3 text-[12.5px] text-ink-2">
        احفظ حقائق يتذكرها المساعد في كل محادثة (حتى 100 حقيقة — الأقدم يُحذف تلقائيًا).
      </p>

      {loading && <p className="text-[13px] text-ink-2">جارٍ التحميل…</p>}
      {error && <p className="mb-2 text-[13px] text-danger">{error}</p>}

      <div className="mb-3 flex flex-col gap-2">
        <Field
          label={`حقيقة جديدة (${fact.length}/300)`}
          value={fact}
          onChange={(e) => setFact(e.target.value.slice(0, 300))}
          placeholder="مثال: أفضّل الردود المختصرة بالعربية"
        />
        <div className="flex items-center gap-2">
          <label className="text-[12.5px] font-medium text-ink-2">التصنيف</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 rounded-md border border-hair bg-surface-2 px-3 text-[13.5px] text-ink focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" onClick={handleAdd} disabled={saving || !fact.trim()}>
            إضافة
          </Button>
        </div>
      </div>

      <Panel>
        {facts.map((f) => (
          <div key={f.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-[13.5px] leading-6">{f.fact}</p>
              <span className="text-[11.5px] text-ink-3">{f.category}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => handleDelete(f.id)} className="shrink-0">
              حذف
            </Button>
          </div>
        ))}
        {facts.length === 0 && !loading && (
          <p className="px-4 py-3 text-[12.5px] text-ink-3">لا توجد حقائق محفوظة بعد.</p>
        )}
      </Panel>
    </div>
  );
}
