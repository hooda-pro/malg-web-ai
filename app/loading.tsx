export default function Loading() {
  return (
    <main
      className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-ground"
      role="status"
      aria-live="polite"
      aria-label="جاري التحميل"
    >
      <div className="aurora" aria-hidden="true">
        <span
          className="aurora-blob left-[20%] top-[20%] h-64 w-64"
          style={{ background: "var(--aurora-1)" }}
        />
        <span
          className="aurora-blob aurora-blob-b right-[15%] top-[45%] h-72 w-72"
          style={{ background: "var(--aurora-2)" }}
        />
      </div>
      <div className="relative flex flex-col items-center gap-4">
        <span className="live-dot grid h-12 w-12 place-items-center rounded-xl bg-accent text-xl font-semibold text-accent-ink shadow-accent">
          M
        </span>
        <span className="typing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    </main>
  );
}
