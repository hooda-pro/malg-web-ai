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
 * راوتر بسيط بالـ hash: `/#/admin` يفتح لوحة الأدمن، `/#/api` يفتح صفحة
 * API للمطورين، وأي حاجة تانية تفتح الشات. بيعمل listen على hashchange
 * عشان التنقل بين اللوحتين يبقى فوري.
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

  if (route === "admin") return <AdminRoot />;
  if (route === "api") return <ApiKeysPage />;

  return (
    <SettingsProvider>
      <ChatShell />
    </SettingsProvider>
  );
}