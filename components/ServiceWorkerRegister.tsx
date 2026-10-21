"use client";

import { useEffect } from "react";

/** يسجّل الـ service worker في الإنتاج فقط. لا يعرض شيئاً. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // تجاهل فشل التسجيل — التطبيق يعمل بدونه
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return null;
}
