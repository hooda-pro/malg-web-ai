"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { translate, type Lang } from "@/lib/i18n";

export type Theme = "light" | "dark";
export type ModelId = "malg-2" | "malg-2.1" | "malg-2.2";

export const AVAILABLE_MODELS: { id: ModelId; label: string; hint: string }[] = [
  { id: "malg-2", label: "malg-2", hint: "الموديل الأساسي — سريع ومتوازن" },
  { id: "malg-2.1", label: "malg-2.1", hint: "موديل تجريبي جديد" },
  { id: "malg-2.2", label: "malg-2.2", hint: "موديل تجريبي — أداء أقوى في مهام معينة" },
];


interface Settings {
  lang: Lang;
  theme: Theme;
  animations: boolean;
  showTime: boolean;
  model: ModelId;
}

const DEFAULTS: Settings = { lang: "ar", theme: "light", animations: true, showTime: true, model: "malg-2" };
const STORAGE_KEY = "mlag-settings";

interface SettingsValue {
  lang: Lang;
  theme: Theme;
  animations: boolean;
  showTime: boolean;
  model: ModelId;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  setAnimations: (on: boolean) => void;
  setShowTime: (on: boolean) => void;
  setModel: (model: ModelId) => void;
  /** ترجمة نص بمعاملات اختيارية: t("balance", { n: "500,000" }) */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const SettingsContext = createContext<SettingsValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  // قراءة الإعدادات المحفوظة من الجهاز
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Settings>;
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // تجاهل
    }
    setLoaded(true);
  }, []);

  // تطبيق اللغة/الاتجاه + حفظ الإعدادات
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // تجاهل
    }
    const dir = settings.lang === "ar" ? "rtl" : "ltr";
    const root = document.documentElement;
    root.lang = settings.lang;
    root.dir = dir;
    root.setAttribute("data-theme", settings.theme);
    root.classList.toggle("no-anim", !settings.animations);
  }, [settings, loaded]);

  const setLang = useCallback((lang: Lang) => setSettings((p) => ({ ...p, lang })), []);
  const setTheme = useCallback((theme: Theme) => setSettings((p) => ({ ...p, theme })), []);
  const setAnimations = useCallback((on: boolean) => setSettings((p) => ({ ...p, animations: on })), []);
  const setShowTime = useCallback((on: boolean) => setSettings((p) => ({ ...p, showTime: on })), []);
  const setModel = useCallback((model: ModelId) => setSettings((p) => ({ ...p, model })), []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(settings.lang, key, params),
    [settings.lang]
  );

  const value = useMemo<SettingsValue>(
    () => ({
      lang: settings.lang,
      theme: settings.theme,
      animations: settings.animations,
      showTime: settings.showTime,
      model: settings.model,
      dir: settings.lang === "ar" ? "rtl" : "ltr",
      setLang,
      setTheme,
      setAnimations,
      setShowTime,
      setModel,
      t,
    }),
    [settings, setLang, setTheme, setAnimations, setShowTime, setModel, t]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    // احتياط — لو اتستخدم برا الـ Provider
    return {
      lang: DEFAULTS.lang,
      theme: DEFAULTS.theme,
      animations: DEFAULTS.animations,
      showTime: DEFAULTS.showTime,
      model: DEFAULTS.model,
      dir: "rtl",
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
