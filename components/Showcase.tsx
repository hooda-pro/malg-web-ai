"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, Maximize2, Terminal, X } from "lucide-react";

/** مقاس "اللوحة" الأصلية للسكرين (بيتصغّر تلقائيًا على الشاشات الأضيق). */
const W = 960;
const H = 540;

const TASKS = ["شراء خبز وفاكهة", "مراجعة الرسايل", "ترتيب المكتب"];
const STEPS = ["كتبت ملف index.html", "شغّلت الصفحة في بيئة معزولة", "فحصت النتيجة وطلعت سليمة"];

function MockChat() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 text-start">
      <div className="max-w-[88%] self-start rounded-2xl bg-accent-soft px-3.5 py-2.5 text-[13px] leading-6 text-ink">
        ابني لي صفحة لقائمة مهام بسيطة وشغّلها
      </div>
      <div className="rounded-xl border border-hair bg-surface-2">
        <div className="flex items-center gap-2 border-b border-hair px-3 py-2 text-[12px] font-medium text-ink-2">
          <Terminal size={14} />
          خطوات التنفيذ
        </div>
        <ul className="space-y-2 px-3 py-2.5">
          {STEPS.map((s) => (
            <li key={s} className="flex items-center gap-2 text-[12.5px] text-ink-2">
              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-live-soft text-live">
                <Check size={11} strokeWidth={3} />
              </span>
              {s}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-[13px] leading-6 text-ink">
        خلصت — الصفحة شغّالة في المعاينة جنبك. تحب أضيف ثيم داكن أو حفظ للمهام؟
      </p>
      <div className="mt-auto flex items-center gap-2 rounded-full border border-hair bg-surface py-1.5 pe-1.5 ps-4 text-[12.5px] text-ink-3">
        <span className="flex-1">اكتب رسالتك…</span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-ink">
          <ArrowUp size={14} />
        </span>
      </div>
    </div>
  );
}

function MockPreview({ interactive }: { interactive: boolean }) {
  const [done, setDone] = useState<number[]>([1]);
  const toggle = (i: number) => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 text-[12px] text-[#6b6b70]">
        <span className="h-2 w-2 rounded-full bg-[#1d9e5b]" />
        معاينة حيّة
      </div>
      {/* المعاينة صفحة ويب بيضاء دايمًا (زي الحقيقية) فألوانها ثابتة مش بتتبع الثيم */}
      <div className="flex flex-1 items-center justify-center bg-[#f5f5f7] p-5">
        <div className="w-full max-w-[290px] rounded-2xl bg-white p-4 text-start shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
          <h4 className="text-[16px] font-semibold text-[#1d1d1f]">مهامي</h4>
          <p className="mt-0.5 text-[12px] text-[#6b6b70]">
            {done.length} من {TASKS.length} خلصت
          </p>
          <ul className="mt-3 space-y-1.5">
            {TASKS.map((task, i) => {
              const isDone = done.includes(i);
              const inner = (
                <>
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                      isDone ? "border-[#0071e3] bg-[#0071e3] text-white" : "border-black/20 text-transparent"
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                  <span className={isDone ? "text-[#9a9aa0] line-through" : "text-[#1d1d1f]"}>{task}</span>
                </>
              );
              return (
                <li key={task}>
                  {interactive ? (
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      aria-pressed={isDone}
                      className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start text-[13px] hover:bg-black/5"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5 px-2 py-2 text-[13px]">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MockWindow({ stacked = false, interactive }: { stacked?: boolean; interactive: boolean }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-hair bg-ground shadow-3">
      <div dir="ltr" className="flex h-10 shrink-0 items-center gap-2 border-b border-hair bg-surface px-4">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <span className="mx-auto pe-12 text-[12px] text-ink-3">MALG AI</span>
      </div>
      {stacked ? (
        <div className="flex flex-col">
          <MockChat />
          <div className="h-[330px] border-t border-hair">
            <MockPreview interactive={interactive} />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="min-h-0 border-e border-hair">
            <MockChat />
          </div>
          <div className="min-h-0">
            <MockPreview interactive={interactive} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Showcase() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / W));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // تحت ~576px (موبايل) السكرين بيبقى صغير ومقفول، والضغط عليه بيفتحه كبير.
  const small = scale < 0.6;

  const artboard = (interactive: boolean) => (
    <div className="relative" style={{ height: H * scale }}>
      <div
        className="absolute right-0 top-0"
        style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top right" }}
      >
        <MockWindow interactive={interactive} />
      </div>
    </div>
  );

  return (
    <div ref={wrapRef} className="mx-auto w-full" style={{ maxWidth: W }}>
      {small ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="تكبير السكرين التوضيحي"
          className="relative block w-full rounded-2xl text-start"
        >
          <div aria-hidden="true" className="pointer-events-none">
            {artboard(false)}
          </div>
          <span className="absolute inset-0 grid place-items-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-ground shadow-3">
              <Maximize2 size={14} />
              اضغط للتكبير
            </span>
          </span>
        </button>
      ) : (
        artboard(true)
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="سكرين توضيحي"
          className="fixed inset-0 z-modal overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="mx-auto my-4 max-w-md">
            <button
              type="button"
              autoFocus
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface text-ink shadow-2"
            >
              <X size={18} />
            </button>
            <MockWindow stacked interactive />
          </div>
        </div>
      )}
    </div>
  );
}
