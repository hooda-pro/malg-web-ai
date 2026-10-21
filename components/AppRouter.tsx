"use client";

import { useEffect, useState } from "react";
import ChatShell from "./ChatShell";
import { SettingsProvider } from "./SettingsContext";
import AdminRoot from "./admin/AdminRoot";
import ApiKeysPage from "./ApiKeysPage";
import SharedChat from "./SharedChat";

type Route = "chat" | "admin" | "api" | "shared";

function currentRoute(): { name: Route; token?: string } {
  if (typeof window === "undefined") return { name: "chat" };
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  const first = parts[0].split(/[?#]/)[0];
  if (first === "admin") return { name: "admin" };
  if (first === "api") return { name: "api" };
  // رابط مشاركة عام: /#/s/<token> — يعمل من غير تسجيل دخول
  if (first === "s" && parts[1]) return { name: "shared", token: parts[1].split(/[?#]/)[0].slice(0, 64) };
  return { name: "chat" };
}

/**
 * راوتر بسيط بالـ hash: `/#/admin` لوحة الأدمن، `/#/api` لوحة الـ API للمطورين،
 * `/#/s/<token>` محادثة مشاركة عامة (قراءة فقط، بدون حساب)، وأي حاجة تانية الشات.
 * كل الشاشات جوه SettingsProvider عشان الثيم يبقى واحد.
 */
export default function AppRouter() {
  const [route, setRoute] = useState<{ name: Route; token?: string }>({ name: "chat" });

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
      {route.name === "admin" ? (
        <div dir="rtl" lang="ar">
          <AdminRoot />
        </div>
      ) : route.name === "api" ? (
        <ApiKeysPage />
      ) : route.name === "shared" && route.token ? (
        <SharedChat token={route.token} />
      ) : (
        <ChatShell />
      )}
    </SettingsProvider>
  );
}
