"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Loader2, PlugZap, RefreshCw, Save } from "lucide-react";
import type { ProviderConfigPublic } from "@/lib/provider";

interface Loaded {
  active: ProviderConfigPublic;
  fromEnv: boolean;
}

const PRESETS: { label: string; name: string; baseUrl: string; model: string }[] = [
  { label: "Token Harbor — DeepSeek V4.1", name: "Token Harbor", baseUrl: "https://tokenharbor.ai/v1/chat/completions", model: "deepseek-v4.1-flash:free" },
  { label: "OpenRouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1/chat/completions", model: "deepseek/deepseek-chat-v3-0324:free" },
  { label: "DeepSeek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1/chat/completions", model: "deepseek-chat" },
  { label: "OpenAI", name: "OpenAI", baseUrl: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini" },
  { label: "Groq", name: "Groq", baseUrl: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
];

/** قسم مزوّد الموديل — الأدمن بيغيّر الرابط/الموديل/المفاتيح من غير كود */
export default function AdminProvider({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKeys, setApiKeys] = useState("");
  const [temperature, setTemperature] = useState("0.4");
  const [maxTokens, setMaxTokens] = useState("128000");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/provider");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحميل");
      setLoaded({ active: data.active, fromEnv: data.fromEnv });
      const a = data.active as ProviderConfigPublic;
      setName(a.name || "");
      setBaseUrl(a.baseUrl || "");
      setModel(a.model || "");
      setTemperature(String(0.4));
      setMaxTokens(String(128000));
      setApiKeys("");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل تحميل الإعداد");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payload = () => ({
    name, baseUrl, model, apiKeys,
    temperature: Number(temperature),
    maxTokens: Number(maxTokens),
  });

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTestResult({ ok: false, text: data.error || "فشل الاتصال" });
        return;
      }
      setTestResult({ ok: true, text: data.sample ? `شغال — رد الموديل: ${data.sample}` : "شغال — الاتصال ناجح" });
    } catch {
      setTestResult({ ok: false, text: "مشكلة في الاتصال — حاول تاني" });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setLoaded({ active: data.active, fromEnv: false });
      setApiKeys("");
      notify("ok", `تم تفعيل المزوّد: ${data.active.name} — ${data.active.model}`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !loaded) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-3">
        <Loader2 size={18} className="animate-spin text-accent" />
        <span className="text-[13px]">جاري تحميل إعداد المزوّد…</span>
      </div>
    );
  }

  const inputCls = "w-full rounded-md border border-hair bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlugZap size={15} className="text-accent" />
            <h2 className="text-[13px] font-semibold text-ink">المزوّد النشط حاليا</h2>
          </div>
          <button onClick={load} title="تحديث" className="rounded-md border border-hair bg-surface p-2 text-ink-2 hover:text-accent">
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="space-y-2 text-[13px]">
          <div className="flex items-center justify-between rounded-md border border-hair bg-surface-2 px-3 py-2">
            <span className="text-ink-3">الاسم</span>
            <span className="font-medium text-ink">{loaded.active.name}</span>
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
              {loaded.active.keysCount > 0 ? `${loaded.active.keysCount} مفتاح (${loaded.active.maskedKeys[0] ?? ""})` : "مفيش مفاتيح"}
            </span>
          </div>
          {loaded.fromEnv && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-[12px] leading-5 text-warn">
              شغال حاليا من متغيرات البيئة — احفظ إعداد من هنا عشان تتحكم فيه من اللوحة بعد كده.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <h2 className="mb-1 text-[13px] font-semibold text-ink">تغيير المزوّد</h2>
        <p className="mb-3 text-[12px] leading-5 text-ink-3">
          التعليمات وشخصية MALG والبحث والتخزين ثابتين — اللي بيتغيّر بس الرابط والموديل والمفتاح.
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => { setName(p.name); setBaseUrl(p.baseUrl); setModel(p.model); }}
              className="rounded-full border border-hair bg-surface-2 px-2.5 py-1 text-[11.5px] text-ink-2 hover:border-accent-line hover:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">اسم المزوّد (للعرض بس)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: DeepSeek" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">رابط الـ API</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.deepseek.com/v1/chat/completions" dir="ltr" className={`${inputCls} tnum`} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">اسم الموديل (زي ما المزوّد مسمّيه بالظبط)</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" dir="ltr" className={`${inputCls} tnum`} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">مفاتيح الـ API (مفتاح في سطر — بتتخزن على السيرفر بس)</label>
            <textarea value={apiKeys} onChange={(e) => setApiKeys(e.target.value)} placeholder="sk-...." dir="ltr" rows={3} className={`${inputCls} tnum resize-y`} />
            <p className="mt-1 text-[11.5px] text-ink-3">الحفظ بيستبدل المفاتيح كلها — اكتب كل المفاتيح كل مرة.</p>
          </div>
          <div className="flex gap-2.5">
            <div className="flex-1">
              <label className="mb-1 block text-[12px] text-ink-2">الحرارة (0 - 2)</label>
              <input value={temperature} onChange={(e) => setTemperature(e.target.value)} inputMode="decimal" dir="ltr" className={`${inputCls} tnum`} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[12px] text-ink-2">أقصى توكنز للرد</label>
              <input value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} inputMode="numeric" dir="ltr" className={`${inputCls} tnum`} />
            </div>
          </div>

          {testResult && (
            <p className={`rounded-md px-3 py-2 text-[12.5px] leading-5 ${testResult.ok ? "bg-live-soft text-live" : "bg-danger-soft text-danger"}`} dir="auto">
              {testResult.text}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={test}
              disabled={testing || saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-hair bg-surface-2 py-2.5 text-[13.5px] font-semibold text-ink hover:border-accent-line hover:text-accent disabled:opacity-40"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              {testing ? "جاري الاختبار…" : "اختبار الاتصال"}
            </button>
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
    </div>
  );
}
