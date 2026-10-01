"use client";

import { useEffect, useState } from "react";
import ChatShell from "./ChatShell";
import { SettingsProvider } from "./SettingsContext";
import AdminRoot from "./admin/AdminRoot";
import ApiKeysPage from "./ApiKeysPage";
import LandingPage from "./LandingPage";

type Route = "landing" | "chat" | "admin" | "api";

function currentRoute(): Route {
  if (typeof window === "undefined") return "landing";
  const hash = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  if (hash === "admin") return "admin";
  if (hash === "api") return "api";
  if (hash === "chat") return "chat";
  return "landing";
}

/**
 * Hash router:
 *  - `/`        → لاندنج سينمائية (لا دخول تلقائي للشات)
 *  - `/#/chat`  → الشات
 *  - `/#/api`   → لوحة الـ API للمطورين
 *  - `/#/admin` → لوحة الأدمن
 *  كل الشاشات داخل SettingsProvider لتوحيد الثيم.
 */
export default function AppRouter() {
  const [route, setRoute] = useState<Route>("landing");

  useEffect(() => {
    setRoute(currentRoute());
    const onHashChange = () => {
      setRoute(currentRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <SettingsProvider>
      {route === "admin" ? (
        <div dir="rtl" lang="ar">
          <AdminRoot />
        </div>
      ) : route === "api" ? (
        <ApiKeysPage />
      ) : route === "chat" ? (
        <ChatShell />
      ) : (
        <LandingPage />
      )}
    </SettingsProvider>
  );
}
