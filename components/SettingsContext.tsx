"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { translate, type Lang } from "@/lib/i18n";

export type Theme = "light" | "dark";

interface Settings {
  lang: Lang;
  theme: Theme;
  animations: boolean;
  showTime: boolean;
}

const DEFAULTS: Settings = { lang: "ar", theme: "light", animations: true, showTime: true };
const STORAGE_KEY = "mlag-settings";

interface SettingsValue {
  lang: Lang;
  theme: Theme;
  animations: boolean;
  showTime: boolean;
  dir: "rtl" | "ltr";
  setLang: (lang: Lang) => void;
  setTheme: (theme: Theme) => void;
  setAnimations: (on: boolean) => void;
  setShowTime: (on: boolean) => void;
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
      dir: settings.lang === "ar" ? "rtl" : "ltr",
      setLang,
      setTheme,
      setAnimations,
      setShowTime,
      t,
    }),
    [settings, setLang, setTheme, setAnimations, setShowTime, t]
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
      dir: "rtl",
      setLang: () => {},
      setTheme: () => {},
      setAnimations: () => {},
      setShowTime: () => {},
      t: (key, params) => translate(DEFAULTS.lang, key, params),
    };
  }
  return ctx;
}