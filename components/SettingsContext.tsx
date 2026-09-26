"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { translate, type Lang } from "@/lib/i18n";

export type Theme = "system" | "light" | "dark";
export type ModelId = "malg-2" | "malg-2.1" | "malg-2.2";

export const AVAILABLE_MODELS: {
  id: ModelId;
  label: string;
  hintKey: string;
  badgeKey?: string;
}[] = [
  { id: "malg-2", label: "malg-2", hintKey: "model2Hint" },
  { id: "malg-2.1", label: "malg-2.1", hintKey: "model21Hint", badgeKey: "modelBadgeBeta" },
  { id: "malg-2.2", label: "malg-2.2", hintKey: "model22Hint", badgeKey: "modelBadgeBeta" },
];

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
  model: "malg-2",
  enterToSend: true,
  customInstructions: "",
  nickname: "",
};
const STORAGE_KEY = "mlag-settings";

interface SettingsValue extends Settings {
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

  const value = useMemo<SettingsValue>(
    () => ({
      ...settings,
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
    [settings, resolvedTheme, update, setLang, setTheme, setAnimations, setShowTime, setModel, t]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    return {
      ...DEFAULTS,
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
