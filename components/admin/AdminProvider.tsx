"use client";

import { useEffect, useState } from "react";
import { Crown, FlaskConical, KeyRound, Layers, Loader2, PlugZap, Plus, RefreshCw, Save, Star, Trash2 } from "lucide-react";
import type { ModelSummary, ProviderConfigPublic, ProviderProtocol } from "@/lib/provider";

interface Loaded {
  active: ProviderConfigPublic;
  fromEnv: boolean;
  model: { id: string; name: string; isDefault: boolean } | null;
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
 * إدارة الموديلات والمزوّدين — كل موديل في قايمته الخاصة بإعداد مزوّد كامل
 * (رابط/بروتوكول/موديل upstream/مفاتيح/حرارة/توكنز):
 * - كارت الموديلات: عرض + إضافة + حذف + تعيين افتراضي
 * - كارت المزوّد النشط + كارت المفاتيح + نموذج التعديل: كلها للموديل المحدد
 */
export default function AdminProvider({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [models, setModels] = useState<ModelSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // إضافة موديل جديد
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addId, setAddId] = useState("");
  const [adding, setAdding] = useState(false);

  // إجراءات على صف موديل (حذف/افتراضي)
  const [actingId, setActingId] = useState<string | null>(null);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<string | null>(null);

  const loadModels = async (keepId?: string | null): Promise<ModelSummary[]> => {
    const res = await fetch("/api/admin/models");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "فشل تحميل الموديلات");
    const list = (data.models ?? []) as ModelSummary[];
    setModels(list);
    return list;
  };

  const pickSelection = (list: ModelSummary[], keepId?: string | null): string | null => {
    if (keepId && list.some((m) => m.id === keepId)) return keepId;
    return list.find((m) => m.isDefault)?.id ?? list[0]?.id ?? null;
  };

  const loadProvider = async (modelId: string) => {
    setLoading(true);
    try {
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
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل تحميل الإعداد");
    } finally {
      setLoading(false);
    }
  };

  const init = async () => {
    setLoading(true);
    try {
      const list = await loadModels();
      const sel = pickSelection(list);
      setSelectedId(sel);
      if (sel) await loadProvider(sel);
      else setLoading(false);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل تحميل الموديلات");
      setLoading(false);
    }
  };

  useEffect(() => {
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelectModel = async (id: string) => {
    if (id === selectedId || saving || testing || addingKey) return;
    setSelectedId(id);
    setTestResult(null);
    await loadProvider(id);
  };

  const refreshModelsKeepSelection = async () => {
    try {
      const list = await loadModels(selectedId);
      setSelectedId(pickSelection(list, selectedId));
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل تحديث القائمة");
    }
  };

  const savedExists = !!loaded && !loaded.fromEnv;

  const settingsPayload = () => ({
    modelId: selectedId,
    name, baseUrl, protocol, model,
    temperature: Number(temperature),
    maxTokens: Number(maxTokens),
  });

  const test = async () => {
    if (!selectedId) return;
    setTesting(true);
    setTestResult(null);
    try {
      // قبل أول حفظ: الاختبار بقيم الفورم والمفتاح المكتوب. بعد الحفظ: الاختبار
      // بقيم الفورم المعدلة مع أول مفتاح محفوظ (المفاتيح لا تخرج من السيرفر).
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
    if (!loaded || !selectedId || testingIdx !== null) return;
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
          modelId: selectedId,
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
    if (!selectedId) return;
    const key = newKey.trim();
    if (!key || addingKey) return;
    setAddingKey(true);
    try {
      const res = await fetch("/api/admin/provider/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", key, modelId: selectedId }),
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

  const removeKey = async (idx: number) => {
    if (!selectedId) return;
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
        body: JSON.stringify({ action: "remove", index: idx, modelId: selectedId }),
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

  const save = async () => {
    if (!selectedId) return;
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
      setLoaded((prev) => (prev ? { ...prev, active: data.active, fromEnv: false, model: data.model ?? prev.model } : prev));
      setFirstKey("");
      await refreshModelsKeepSelection();
      notify("ok", `تم تفعيل مزوّد الموديل ${selectedId}: ${data.active.name} — ${data.active.model} [${data.active.protocol ?? protocol}]`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const addModel = async () => {
    const nm = addName.trim();
    if (!nm || adding) return;
    setAdding(true);
    try {
      const res = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nm, id: addId.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل إنشاء الموديل");
      const list = (data.models ?? []) as ModelSummary[];
      setModels(list);
      const created = list.find((m) => m.id === data.createdId) ?? list.find((m) => m.name === nm) ?? list[list.length - 1];
      setAddName("");
      setAddId("");
      setShowAdd(false);
      notify("ok", `تم إنشاء الموديل ${nm} — عدّل إعدادات مزوّده واحفظها`);
      if (created) {
        setSelectedId(created.id);
        await loadProvider(created.id);
      }
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل إنشاء الموديل");
    } finally {
      setAdding(false);
    }
  };

  const setDefault = async (id: string) => {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_default: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التعيين");
      setModels(data.models ?? []);
      notify("ok", `بقى الموديل الافتراضي: ${id}`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التعيين");
    } finally {
      setActingId(null);
    }
  };

  const setSupportsVideo = async (id: string, v: boolean) => {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supports_video: v }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "update failed");
      setModels(data.models ?? []);
      notify("ok", v ? `Native video ON for ${id}` : `Native video OFF for ${id} (frames fallback)`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "update failed");
    } finally {
      setActingId(null);
    }
  };

  const setTier = async (id: string, tier: "free" | "paid") => {
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل التحديث");
      setModels(data.models ?? []);
      notify("ok", tier === "paid" ? `الموديل ${id} بقى مدفوع (مشتركو Pro فقط)` : `الموديل ${id} بقى مجاني للكل`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل التحديث");
    } finally {
      setActingId(null);
    }
  };

  const deleteModel = async (id: string) => {
    if (confirmDeleteModel !== id) {
      setConfirmDeleteModel(id);
      setTimeout(() => setConfirmDeleteModel((c) => (c === id ? null : c)), 4000);
      return;
    }
    setConfirmDeleteModel(null);
    setActingId(id);
    try {
      const res = await fetch(`/api/admin/models/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل الحذف");
      const list = (data.models ?? []) as ModelSummary[];
      setModels(list);
      notify("ok", `تم حذف الموديل ${id}`);
      if (selectedId === id) {
        const sel = pickSelection(list);
        setSelectedId(sel);
        if (sel) await loadProvider(sel);
        else setLoaded(null);
      }
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "فشل الحذف");
    } finally {
      setActingId(null);
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
  const busy = saving || testing || addingKey || adding || actingId !== null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-accent" />
            <h2 className="text-[13px] font-semibold text-ink">الموديلات</h2>
          </div>
          <button
            onClick={() => setShowAdd((s) => !s)}
            className="flex items-center gap-1.5 rounded-md border border-hair bg-surface-2 px-2.5 py-1.5 text-[12.5px] font-medium text-ink-2 hover:border-accent-line hover:text-accent"
          >
            <Plus size={13} />
            موديل جديد
          </button>
        </div>
        <p className="mb-3 text-[12px] leading-5 text-ink-3">
          كل موديل ليه قايمة مزوّد خاصة بيه (رابط + بروتوكول + مفاتيح) — اختار موديل من القايمة عشان تعدّل إعداداته تحت.
        </p>

        {showAdd && (
          <div className="mb-3 space-y-2 rounded-md border border-hair bg-surface-2 p-3">
            <div className="flex gap-2">
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="اسم الموديل (مثال: DeepSeek V3)"
                className={inputCls}
              />
              <input
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
                placeholder="id اختياري (إنجليزي)"
                dir="ltr"
                className={`${inputCls} tnum max-w-[180px]`}
              />
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

        <div className="space-y-2">
          {(models ?? []).map((m) => {
            const selected = m.id === selectedId;
            const acting = actingId === m.id;
            return (
              <div
                key={m.id}
                className={`rounded-md border px-3 py-2 transition-colors ${selected ? "border-accent-line bg-accent-soft/40" : "border-hair bg-surface-2"}`}
              >
                <div className="flex items-center gap-2">
                  <button onClick={() => onSelectModel(m.id)} disabled={busy} title={`إدارة ${m.name}`} className="min-w-0 flex-1 text-start disabled:opacity-40">
                    <span className="flex items-center gap-2">
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
                      {((m as { tier?: string }).tier ?? "free") === "paid" ? (
                        <span className="shrink-0 rounded-full bg-warn-soft px-1.5 py-px text-[10.5px] font-bold text-warn">
                          ★ Pro
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-live-soft px-1.5 py-px text-[10.5px] font-medium text-live">
                          مجاني
                        </span>
                      )}
                      {m.supportsVideo === true && (
                        <span className="shrink-0 rounded-full bg-live-soft px-1.5 py-px text-[10.5px] font-medium text-live">
                          VID
                        </span>
                      )}
                      {(m.costMultiplier ?? 1) > 1 && (
                        <span
                          className="shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] font-medium text-ink-2"
                          title="معامل تكلفة الخصم (هامش الربح)"
                        >
                          ×{m.costMultiplier}
                        </span>
                      )}
                    </span>
                    <span className="tnum mt-0.5 block truncate text-[11.5px] text-ink-3" dir="ltr">
                      {m.id} · {m.keysCount} {m.keysCount === 1 ? "مفتاح" : "مفاتيح"}
                    </span>
                  </button>
                  {!m.isDefault && (
                    <button
                      onClick={() => setDefault(m.id)}
                      disabled={busy}
                      title="تعيين كافتراضي"
                      aria-label={`تعيين ${m.name} افتراضيًا`}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-accent disabled:opacity-40"
                    >
                      {acting ? <Loader2 size={13} className="animate-spin" /> : <Star size={13} />}
                    </button>
                  )}
                  <button
                    onClick={() => setTier(m.id, ((m as { tier?: string }).tier ?? "free") === "paid" ? "free" : "paid")}
                    disabled={busy}
                    title={((m as { tier?: string }).tier ?? "free") === "paid" ? "اجعله مجانيًا للكل" : "اجعله مدفوعًا (Pro فقط)"}
                    aria-label="تبديل مجاني/مدفوع"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors duration-1 hover:bg-surface-3 disabled:opacity-40"
                  >
                    {acting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Crown size={13} className={((m as { tier?: string }).tier ?? "free") === "paid" ? "text-warn" : "text-ink-3"} />
                    )}
                  </button>
                  <button
                    onClick={() => setSupportsVideo(m.id, !(m.supportsVideo === true))}
                    disabled={busy}
                    title="native video on/off (Gemini-class models)"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors duration-1 hover:bg-surface-3 disabled:opacity-40"
                  >
                    {acting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <span className={m.supportsVideo === true ? "text-[11px] font-bold text-live" : "text-[11px] font-bold text-ink-3"}>
                        VID
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => deleteModel(m.id)}
                    disabled={busy}
                    title={confirmDeleteModel === m.id ? "اضغط تاني للتأكيد" : "حذف الموديل"}
                    aria-label={confirmDeleteModel === m.id ? `تأكيد حذف ${m.name}` : `حذف ${m.name}`}
                    className={`flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-medium transition-colors duration-1 disabled:opacity-40 ${confirmDeleteModel === m.id ? "bg-danger-soft text-danger" : "text-ink-3 hover:bg-danger-soft hover:text-danger"}`}
                  >
                    {acting ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <>
                        <Trash2 size={13} />
                        {confirmDeleteModel === m.id && <span>تأكيد؟</span>}
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
          {(models ?? []).length === 0 && (
            <p className="rounded-md bg-warn-soft px-3 py-2 text-[12px] text-warn">لا توجد موديلات — أنشئ واحدًا من الزرار فوق.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PlugZap size={15} className="text-accent" />
            <h2 className="text-[13px] font-semibold text-ink">
              مزوّد الموديل: {loaded.model?.name ?? selectedId ?? ""}
            </h2>
          </div>
          <button onClick={() => selectedId && loadProvider(selectedId)} title="تحديث" className="rounded-md border border-hair bg-surface p-2 text-ink-2 hover:text-accent">
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
        <h2 className="mb-1 text-[13px] font-semibold text-ink">تغيير مزوّد الموديل المحدد</h2>
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
