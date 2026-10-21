"use client";

import { useEffect, useState, type ReactNode } from "react";
import AppRouter from "./AppRouter";

/**
 * بوابة الصفحة الرئيسية للزائر غير المسجّل: بيشوف صفحة الهبوط (اللي السيرفر رسمها جاهزة).
 * أي رابط hash حقيقي (/#/chat أو /#/api أو /#/admin) بيفتح التطبيق، ومن ساعتها بيفضل التطبيق
 * (عمدًا مبيرجعش للهبوط لو الـhash اتفضّى، عشان اللي سجّل دخوله لسه جوه الصفحة ما يتخبّطش).
 */
export default function HomeGate({ landing }: { landing: ReactNode }) {
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    const sync = () => setInApp((prev) => prev || /^#\/./.test(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return inApp ? <AppRouter /> : <>{landing}</>;
}
