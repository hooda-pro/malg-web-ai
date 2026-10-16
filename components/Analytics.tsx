"use client";

import { useEffect } from "react";

/**
 * تحليلات اختيارية بدون أي اعتمادات جديدة:
 * - PostHog عبر NEXT_PUBLIC_POSTHOG_KEY (script + تتبع المشاهدات)
 * - Umami عبر NEXT_PUBLIC_UMAMI_SRC + NEXT_PUBLIC_UMAMI_ID
 * لو لا يوجد أي مفتاح، لا يعرض شيئاً.
 * يتتبع تغيّر الهاش (hashchange) لأن التطبيق يستخدم مسارات #/.
 */
export default function Analytics() {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const umamiSrc = process.env.NEXT_PUBLIC_UMAMI_SRC;
  const umamiId = process.env.NEXT_PUBLIC_UMAMI_ID;

  const hasPosthog = Boolean(posthogKey);
  const hasUmami = Boolean(umamiSrc && umamiId);

  useEffect(() => {
    if (!hasPosthog && !hasUmami) return;
    const track = () => {
      try {
        // PostHog
        const ph = (window as unknown as { posthog?: { capture: (e: string) => void } }).posthog;
        if (hasPosthog && ph) ph.capture("$pageview");
        // Umami يتتبع تلقائياً، وندعم التتبع اليدوي عند توفره
        const umami = (window as unknown as { umami?: { track: () => void } }).umami;
        if (hasUmami && umami) umami.track();
      } catch {
        // تجاهل أخطاء التتبع — لا يجب أن تكسر التطبيق
      }
    };
    window.addEventListener("hashchange", track);
    return () => window.removeEventListener("hashchange", track);
  }, [hasPosthog, hasUmami]);

  if (!hasPosthog && !hasUmami) return null;

  return (
    <>
      {hasPosthog && (
        <script
          src="https://eu.i.posthog.com/static/array.js"
          defer
          onLoad={() => {
            try {
              const w = window as unknown as {
                posthog?: { init: (k: string, o: object) => void; capture: (e: string) => void };
              };
              if (w.posthog && posthogKey) {
                w.posthog.init(posthogKey, { api_host: "https://eu.i.posthog.com" });
                w.posthog.capture("$pageview");
              }
            } catch {
              // تجاهل
            }
          }}
        />
      )}
      {hasUmami && (
        <script defer src={umamiSrc} data-website-id={umamiId} />
      )}
    </>
  );
}
