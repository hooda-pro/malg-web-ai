"use client";

import { useEffect, useState } from "react";
import ChatShell from "./ChatShell";
import { SettingsProvider } from "./SettingsContext";
import AdminRoot from "./admin/AdminRoot";
import ApiKeysPage from "./ApiKeysPage";

type Route = "chat" | "admin" | "api";

function currentRoute(): Route {
  if (typeof window === "undefined") return "chat";
  const hash = window.location.hash.replace(/^#\/?/, "").split(/[/?]/)[0];
  if (hash === "admin") return "admin";
  if (hash === "api") return "api";
  return "chat";
}

/**
 * راوتر بسيط بالـ hash: `/#/admin` لوحة الأدمن، `/#/api` لوحة الـ API للمطورين،
 * وأي حاجة تانية الشات. كل الشاشات جوه SettingsProvider عشان الثيم يبقى واحد.
 */
export default function AppRouter() {
  const [route, setRoute] = useState<Route>("chat");

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
      ) : (
        <ChatShell />
      )}
    </SettingsProvider>
  );
}
