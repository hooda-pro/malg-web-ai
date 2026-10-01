export default function Loading() {
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-ground">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-hair border-t-accent" aria-hidden />
        <p className="text-[13px] text-ink-3">جاري التحميل…</p>
      </div>
    </div>
  );
}
