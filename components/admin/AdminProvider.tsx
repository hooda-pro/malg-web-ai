"use client";

import { useEffect, useState } from "react";
import { FlaskConical, KeyRound, Loader2, PlugZap, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { ProviderConfigPublic, ProviderProtocol } from "@/lib/provider";

interface Loaded {
  active: ProviderConfigPublic;
  fromEnv: boolean;
}

const PRESETS: { label: string; name: string; baseUrl: string; model: string; protocol: ProviderProtocol }[] = [
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

/**
 * قسم مزوّد الموديل — الإعدادات (بروتوكول/رابط/موديل) في كارت، وإدارة
 * المفاتيح في كارت مستقل: عرض متخفي + إضافة + مسح + اختبار كل مفتاح لوحده.
 * السيرفر أصلًا بيوزّع الحمل على المفاتيح وبيقلب تلقائيًا على اللي بعده لو
 * واحد خلص أو اترفض — فكل مفتاح تضيفه هنا معناه استمرارية فورية.
 */
export default function AdminProvider({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [protocol, setProtocol] = useState<ProviderProtocol>("chat_completions");
  const [model, setModel] = useState("");
  const [firstKey, setFirstKey] = useState("");
  const [temperature, setTemperature] = useState("0.4");
  const [maxTokens, setMaxTokens] = useState("128000");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  // إدارة المفاتيح
  const [newKey, setNewKey] = useState("");
  const [addingKey, setAddingKey] = useState(false);
  const [removingIdx, setRemovingIdx] = useState<number | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const [testingIdx, setTestingIdx] = useState<number | null>(null);
  const [rowTest, setRowTest] = useState<Record<number, { ok: boolean; text: string }>>({});

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
      setProtocol((a as { protocol?: ProviderProtocol }).protocol === "responses" ? "responses" : "chat_completions");
      setModel(a.model || "");
      setTemperature(String(0.4));
      setMaxTokens(String(128000));
      setFirstKey("");
      setNewKey("");
      setRowTest({});
      setConfirmRemove(null);
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

  const savedExists = !!loaded && !loaded.fromEnv;

  const settingsPayload = () => ({
    name, baseUrl, protocol, model,
    temperature: Number(temperature),
    maxTokens: Number(maxTokens),
  });

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // قبل أول حفظ: الاختبار بقيم الفورم والمفتاح المكتوب. بعد الحفظ: الاختبار
      // بقيم الفورم المعدلة مع أول مفتاح محفوظ (المفاتيح لا تخرج من السيرفر).
      const body = savedExists ? { ...settingsPayload(), savedKeyIndex: 0 } : { ...settingsPayload(), apiKeys: firstKey };
      const res = await fetch("/api/admin/provider/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTestResult({ ok: false, text: data.error || "فشل الاتصال" });
        return;
      }
      setTestResult({ ok: true, text: data.sample ? `شغال [${data.protocol ?? protocol}] — رد الموديل: ${data.sample}` : `شغال [${data.protocol ?? protocol}] — الاتصال ناجح` });
    } catch {
      setTestResult({ ok: false, text: "مشكلة في الاتصال — حاول تاني" });
    } finally {
      setTesting(false);
    }
  };

  /** اختبار مفتاح محفوظ محدد — بالإعدادات المحفوظة (مش قيم الفورم المعدلة) */
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
        body: JSON.stringify({ action: "add", key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الإضافة");
      setLoaded({ active: data.active, fromEnv: false });
      setNewKey("");
      notify("ok", `تمت إضافة المفتاح — بقوا ${data.active.keysCount} مفاتيح`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الإضافة");
    } finally {
      setAddingKey(false);
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
        body: JSON.stringify({ action: "remove", index: idx }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل المسح");
      setLoaded({ active: data.active, fromEnv: false });
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

  const save = async () => {
    setSaving(true);
    try {
      // بعد أول حفظ: المفاتيح تُدار من كارتها المستقل، والحفظ هنا للإعدادات فقط
      // (السيرفر يحتفظ بالمفاتيح المحفوظة). أول حفظ فقط يتطلب مفتاحًا.
      const body = savedExists ? settingsPayload() : { ...settingsPayload(), apiKeys: firstKey };
      const res = await fetch("/api/admin/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحفظ");
      setLoaded({ active: data.active, fromEnv: false });
      setFirstKey("");
      notify("ok", `تم تفعيل المزوّد: ${data.active.name} — ${data.active.model} [${data.active.protocol ?? protocol}]`);
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
  const masked = loaded.active.maskedKeys ?? [];

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
          {loaded.fromEnv && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-[12px] leading-5 text-warn">
              شغال حاليا من متغيرات البيئة — احفظ إعداد من هنا عشان تتحكم فيه من اللوحة بعد كده.
            </p>
          )}
        </div>
      </div>

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
                    onClick={() => testKey(i)}
                    disabled={testingIdx !== null || removingIdx !== null}
                    title="اختبار المفتاح ده"
                    aria-label={`اختبار المفتاح ${i + 1}`}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-accent disabled:opacity-40"
                  >
                    {testingIdx === i ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />}
                  </button>
                  <button
                    onClick={() => removeKey(i)}
                    disabled={testingIdx !== null || removingIdx !== null}
                    title={confirmRemove === i ? "اضغط تاني للتأكيد" : "مسح المفتاح"}
                    aria-label={confirmRemove === i ? `تأكيد مسح المفتاح ${i + 1}` : `مسح المفتاح ${i + 1}`}
                    className={`flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium transition-colors duration-1 disabled:opacity-40 ${confirmRemove === i ? "bg-danger-soft text-danger" : "text-ink-3 hover:bg-danger-soft hover:text-danger"}`}
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
                className={`${inputCls} tnum flex-1`}
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

      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <h2 className="mb-1 text-[13px] font-semibold text-ink">تغيير المزوّد</h2>
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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: DeepSeek" className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">بروتوكول الـ API</label>
            <select value={protocol} onChange={(e) => setProtocol(e.target.value === "responses" ? "responses" : "chat_completions")} className={`${inputCls} tnum`} dir="ltr">
              {PROTOCOL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="mt-1 text-[11.5px] text-ink-3">{PROTOCOL_OPTIONS.find((o) => o.value === protocol)?.hint}</p>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">رابط الـ API (Base URL — المسار النهائي بيتبني حسب البروتوكول)</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" dir="ltr" className={`${inputCls} tnum`} />
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-ink-2">اسم الموديل (زي ما المزوّد مسمّيه بالظبط)</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat" dir="ltr" className={`${inputCls} tnum`} />
          </div>
          {!savedExists && (
            <div>
              <label className="mb-1 block text-[12px] text-ink-2">مفتاح API الأول (بيتخزن على السيرفر بس)</label>
              <input value={firstKey} onChange={(e) => setFirstKey(e.target.value)} placeholder="sk-...." dir="ltr" autoComplete="off" spellCheck={false} className={`${inputCls} tnum`} />
              <p className="mt-1 text-[11.5px] text-ink-3">بعد أول حفظ، هتدير كل المفاتيح (إضافة/مسح/اختبار) من كارت المفاتيح فوق.</p>
            </div>
          )}
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
