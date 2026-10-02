export default function Loading() {
  return (
    <main
      className="grid min-h-[100dvh] place-items-center bg-ground"
      role="status"
      aria-live="polite"
      aria-label="جاري التحميل"
    >
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-3 border-t-transparent" />
    </main>
  );
}
