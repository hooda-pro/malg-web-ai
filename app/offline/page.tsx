export const metadata = { title: "غير متصل | MALG AI" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-ground px-4 text-ink">
      <div className="w-full max-w-sm rounded-xl border border-hair bg-surface p-6 text-center shadow-3">
        <p className="text-lg font-semibold">أنت غير متصل</p>
        <p className="mt-2 text-[13.5px] leading-7 text-ink-2">
          لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم حاول مرة أخرى.
        </p>
        <a
          href="/"
          className="mt-5 inline-block rounded-md bg-accent px-5 py-2.5 text-[14px] font-semibold text-accent-ink hover:bg-accent-hover"
        >
          العودة للرئيسية
        </a>
      </div>
    </main>
  );
}
