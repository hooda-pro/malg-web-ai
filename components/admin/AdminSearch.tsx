"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Loader2, RefreshCw, Save, Search } from "lucide-react";

/** قسم البحث الحقيقي — تفعيل/مفتاح Tavily/اختبار، من غير ما تمس env */
export default function AdminSearch({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [enabled, setEnabled] = useState(true);
  const [apiKeys, setApiKeys] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [keysCount, setKeysCount] = useState(0);
  const [fromEnv, setFromEnv] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/search");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحميل");
      setEnabled(data.search.enabled !== false);
      setHasKey(!!data.search.hasKey);
      setKeysCount(Number(data.search.keysCount ?? 0));
      setFromEnv(!!data.search.fromEnv);
      setApiKeys("");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل تحميل إعداد البحث");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/search/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKeys }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTestResult({ ok: false, text: data.error || "فشل الاتصال" });
        return;
      }
      setTestResult({ ok: true, text: "مفتاح البحث شغال — Tavily رد بنجاح" });
    } catch {
      setTestResult({ ok: false, text: "مشكلة في الاتصال — حاول تاني" });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, apiKeys: apiKeys.trim() ? apiKeys : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setHasKey(!!data.search.hasKey);
      setKeysCount(Number(data.search.keysCount ?? 0));
      setFromEnv(false);
      setApiKeys("");
      notify("ok", enabled ? "تم تفعيل البحث الحقيقي" : "تم تعطيل البحث");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-3">
        <Loader2 size={18} className="animate-spin text-accent" />
        <span className="text-[13px]">جاري تحميل إعداد البحث…</span>
      </div>
    );
  }

  const inputCls = "w-full rounded-md border border-hair bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search size={15} className="text-accent" />
            <h2 className="text-[13px] font-semibold text-ink">البحث الحقيقي (Tavily)</h2>
          </div>
          <button onClick={load} title="تحديث" className="rounded-md border border-hair bg-surface p-2 text-ink-2 hover:text-accent">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="text-ink-3">الحالة</span>
            <span className={enabled && hasKey ? "font-medium text-live" : "font-medium text-warn"}>
              {enabled && hasKey ? "مفعل وشغال" : enabled ? "مفعل بس مفيش مفتاح" : "معطّل"}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="text-ink-3">المفاتيح</span>
            <span className="tnum text-ink" dir="ltr">{hasKey ? `${keysCount} مفتاح` : "مفيش"}</span>
          </div>
          {fromEnv && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-[12px] leading-5 text-warn">
              شغال حاليا من متغيرات البيئة — احفظ مفتاح من هنا عشان تتحكم فيه من اللوحة.
            </p>
          )}
          <p className="rounded-md bg-surface-2 px-3 py-2 text-[12px] leading-5 text-ink-3">
            الموديل بقى عنده أداة web_search حقيقية: هو اللي يقرر يبحث إمتى وكام مرة، ويختار المصادر بنفسه — مش بحث تلقائي أعمى.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <h2 className="mb-3 text-[13px] font-semibold text-ink">الإعداد</h2>
        <div className="space-y-2.5">
          <label className="flex cursor-pointer items-center justify-between rounded-md border border-hair bg-surface-2 px-3 py-2.5">
            <span className="text-[13px] text-ink">تفعيل البحث الحقيقي</span>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-[#0071e3]" />
          </label>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">مفتاح Tavily (من tavily.com — سيبه فاضي للاحتفاظ بالقديم)</label>
            <textarea value={apiKeys} onChange={(e) => setApiKeys(e.target.value)} placeholder="tvly-...." dir="ltr" rows={2} className={`${inputCls} tnum resize-y`} />
          </div>

          {testResult && (
            <p className={`rounded-md px-3 py-2 text-[12.5px] leading-5 ${testResult.ok ? "bg-live-soft text-live" : "bg-danger-soft text-danger"}`} dir="auto">
              {testResult.text}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={test}
              disabled={testing || saving || !apiKeys.trim()}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-hair bg-surface-2 py-2.5 text-[13.5px] font-semibold text-ink hover:border-accent-line hover:text-accent disabled:opacity-40"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              {testing ? "جاري الاختبار…" : "اختبار المفتاح"}
            </button>
            <button
              onClick={save}
              disabled={saving || testing}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent py-2.5 text-[13.5px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "جاري الحفظ…" : "حفظ"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
