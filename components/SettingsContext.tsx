"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { translate, type Lang } from "@/lib/i18n";

export type Theme = "system" | "light" | "dark";
/** معرف الموديل = slug من لوحة الأدمن (مثال: malg-a3). أي قيمة غير معروفة
 * السيرفر بيقع بها على الموديل الافتراضي تلقائيًا. */
export type ModelId = string;

/** موديل واحد في قوائم الاختيار — الاسم والوصف من الأدمن (أي لغة يكتبها). */
export interface ModelOption {
  id: string;
  label: string;
  hint: string;
  recommended: boolean;
}

export const FALLBACK_MODELS: ModelOption[] = [
  { id: "malg-a3", label: "Malg-A3", hint: "", recommended: true },
];

/** @deprecated استخدم models من useSettings() — باقٍ كـ fallback للتحميل الأول فقط */
export const AVAILABLE_MODELS: {
  id: string;
  label: string;
  hintKey: string;
  badgeKey?: string;
}[] = [{ id: "malg-a3", label: "Malg-A3", hintKey: "modelA3Hint" }];

export const CUSTOM_INSTRUCTIONS_MAX = 1500;

export interface Settings {
  lang: Lang;
  theme: Theme;
  animations: boolean;
  showTime: boolean;
  model: ModelId;
  /** Enter يبعت الرسالة (Shift+Enter سطر جديد). لو مقفول: Ctrl/⌘+Enter يبعت. */
  enterToSend: boolean;
  /** تعليمات مخصصة بتتبعت مع كل رسالة وبتتضاف للـ system prompt على السيرفر. */
  customInstructions: string;
  /** اسم يحب الموديل يناديه بيه (اختياري). */
  nickname: string;
}

const DEFAULTS: Settings = {
  lang: "ar",
  theme: "system",
  animations: true,
  showTime: true,
  model: "malg-a3",
  enterToSend: true,
  customInstructions: "",
  nickname: "",
};
const STORAGE_KEY = "mlag-settings";

interface SettingsValue extends Settings {
  /** قائمة الموديلات المتاحة من السيرفر (أو fallback محلي قبل التحميل) */
  models: ModelOption[];
  /** id الموديل الافتراضي من السيرفر */
  defaultModelId: string;
  /** الثيم الفعلي بعد حل "system" */
  resolvedTheme: "light" | "dark";
  dir: "rtl" | "ltr";
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  setAnimations: (on: boolean) => void;
  setShowTime: (on: boolean) => void;
  setModel: (model: ModelId) => void;
  /** ترجمة نص بمعاملات اختيارية: t("balance", { n: "500,000" }) */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const SettingsContext = createContext<SettingsValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [systemDark, setSystemDark] = useState(false);
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [defaultModelId, setDefaultModelId] = useState<string>("malg-a3");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        // ترحيل القيم القديمة (malg-2 / malg-2.1 / malg-2.2) للموديل الافتراضي،
        // وأي slug آخر يُقبل كما هو — السيرفر يقع بغير المعروف على الافتراضي،
        // والتحقق النهائي ضد قائمة السيرفر يتم بعد تحميل الموديلات.
        if (parsed.model === "malg-2" || parsed.model === "malg-2.1" || parsed.model === "malg-2.2") {
          parsed.model = "malg-a3";
        }
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // تجاهل
    }
    // قائمة الموديلات من السيرفر (اللي الأدمن ضافها) — مع fallback محلي آمن
    fetch("/api/models")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
      .then((data) => {
        const list = Array.isArray(data?.models) ? data.models : [];
        if (list.length === 0) throw new Error("empty");
        const mapped: ModelOption[] = list.map((m: { id: string; name: string; description?: string; isDefault?: boolean }) => ({
          id: String(m.id),
          label: String(m.name || m.id),
          hint: typeof m.description === "string" ? m.description : "",
          recommended: !!m.isDefault,
        }));
        setModels(mapped);
        const def = (typeof data?.defaultId === "string" && data.defaultId) || mapped.find((m) => m.recommended)?.id || mapped[0].id;
        setDefaultModelId(def);
        // لو الإعداد المحفوظ يشير لموديل اتمسح → ارجع للافتراضي
        setSettings((prev) => (mapped.some((m) => m.id === prev.model) ? prev : { ...prev, model: def }));
      })
      .catch(() => {
        setModels(FALLBACK_MODELS);
      });
    setSystemDark(systemPrefersDark());
    setLoaded(true);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: "light" | "dark" =
    settings.theme === "system" ? (systemDark ? "dark" : "light") : settings.theme;

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // تجاهل
    }
    const root = document.documentElement;
    root.lang = settings.lang;
    root.dir = settings.lang === "ar" ? "rtl" : "ltr";
    root.setAttribute("data-theme", resolvedTheme);
    root.classList.toggle("no-anim", !settings.animations);
  }, [settings, loaded, resolvedTheme]);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((p) => ({ ...p, [key]: value }));
  }, []);

  const setLang = useCallback((lang: Lang) => update("lang", lang), [update]);
  const setTheme = useCallback((theme: Theme) => update("theme", theme), [update]);
  const setAnimations = useCallback((on: boolean) => update("animations", on), [update]);
  const setShowTime = useCallback((on: boolean) => update("showTime", on), [update]);
  const setModel = useCallback((model: ModelId) => update("model", model), [update]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(settings.lang, key, params),
    [settings.lang]
  );

  const resolvedModels = models ?? FALLBACK_MODELS;
  const value = useMemo<SettingsValue>(
    () => ({
      ...settings,
      models: resolvedModels,
      defaultModelId,
      resolvedTheme,
      dir: settings.lang === "ar" ? "rtl" : "ltr",
      update,
      setLang,
      setTheme,
      setAnimations,
      setShowTime,
      setModel,
      t,
    }),
    [settings, resolvedModels, defaultModelId, resolvedTheme, update, setLang, setTheme, setAnimations, setShowTime, setModel, t]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    return {
      ...DEFAULTS,
      models: FALLBACK_MODELS,
      defaultModelId: "malg-a3",
      resolvedTheme: "light",
      dir: "rtl",
      update: () => {},
      setLang: () => {},
      setTheme: () => {},
      setAnimations: () => {},
      setShowTime: () => {},
      setModel: () => {},
      t: (key, params) => translate(DEFAULTS.lang, key, params),
    };
  }
  return ctx;
}
