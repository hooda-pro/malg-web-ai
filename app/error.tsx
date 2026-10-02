"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // مكان مناسب لاحقًا لإرسال الخطأ لخدمة مراقبة (Sentry أو غيرها).
    console.error("app error boundary", error);
  }, [error]);

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-ground px-6">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-ink shadow-accent">
          <Sparkles size={22} />
        </span>
        <h1 className="mt-6 text-balance text-[clamp(24px,4vw,34px)] font-semibold tracking-display text-ink">
          حصلت مشكلة غير متوقعة
        </h1>
        <p dir="auto" className="mx-auto mt-3 max-w-[42ch] text-pretty text-[15px] leading-7 text-ink-2">
          Something went wrong on our side. Try again, and if it keeps happening reload the page.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-accent px-6 text-[14px] font-medium text-accent-ink shadow-accent transition-colors duration-1 ease-soft hover:bg-accent-hover"
        >
          حاول تاني · Try again
        </button>
      </div>
    </main>
  );
}
