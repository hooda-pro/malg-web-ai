"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-ground p-6">
      <div className="w-full max-w-md rounded-2xl border border-hair bg-surface p-8 text-center shadow-2">
        <p className="text-[13px] font-medium tracking-widest text-ink-3">MALG AI</p>
        <h1 className="mt-3 text-[20px] font-semibold text-ink">حصل خطأ غير متوقع</h1>
        <p className="mt-2 text-[13.5px] leading-6 text-ink-2">{error.message || "حاول تحديث الصفحة."}</p>
        <button
          onClick={reset}
          className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-accent px-6 text-[13.5px] font-medium text-white transition hover:bg-accent-hover"
        >
          حاول مرة أخرى
        </button>
      </div>
    </div>
  );
}
