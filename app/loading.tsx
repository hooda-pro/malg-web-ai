export default function Loading() {
  return (
    <div
      className="flex h-[100dvh] overflow-hidden bg-ground"
      role="status"
      aria-live="polite"
      aria-label="جاري التحميل"
    >
      {/* sidebar skeleton (desktop) */}
      <div className="hidden w-[280px] shrink-0 flex-col gap-2 border-e border-hair bg-surface p-3 md:flex" aria-hidden="true">
        <div className="skel h-10 rounded-full" />
        <div className="mt-2 space-y-2">
          {[92, 78, 85, 70, 88, 74, 80, 68].map((w, i) => (
            <div key={i} className="skel h-9 rounded-lg" style={{ width: `${w}%` }} />
          ))}
        </div>
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        {/* topbar skeleton */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-hair px-4" aria-hidden="true">
          <div className="skel h-6 w-28 rounded-full" />
          <div className="flex items-center gap-2">
            <div className="skel h-8 w-8 rounded-full" />
            <div className="skel h-9 w-9 rounded-full" />
          </div>
        </div>

        {/* messages skeleton */}
        <div className="mx-auto w-full max-w-[820px] flex-1 space-y-8 overflow-hidden px-4 py-6 sm:px-6" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3">
              <span className="skel h-7 w-7 shrink-0 rounded-[9px]" />
              <div className="min-w-0 flex-1 space-y-2.5 pt-1.5">
                <span className="skel block h-3 w-[72%] rounded-full" />
                <span className="skel block h-3 w-[48%] rounded-full" />
                {i === 1 && <span className="skel block h-3 w-[60%] rounded-full" />}
              </div>
            </div>
          ))}
        </div>

        {/* composer skeleton */}
        <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6" aria-hidden="true">
          <div className="skel mx-auto h-[104px] w-full max-w-[760px] rounded-2xl" />
        </div>
      </main>
    </div>
  );
}
