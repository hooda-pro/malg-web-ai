"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { ArrowUp, Check, Terminal } from "lucide-react";

/**
 * مقاس "اللوحة" الأصلية للسكرين. على الديسكتوب بتتكبّر لحد MAX_SCALE،
 * وتحت STACK_BELOW (موبايل/تابلت صغير) بتتحول لعرض عمودي بالحجم الطبيعي بدل ما تتصغّر.
 */
const W = 960;
const H = 540;
const MAX_SCALE = 1.15;
const STACK_BELOW = 760;

const TASKS = ["شراء الخبز والفاكهة", "مراجعة الرسائل", "ترتيب المكتب"];
const STEPS = ["إنشاء ملف index.html", "تشغيل الصفحة في بيئة معزولة", "فحص النتيجة والتأكد من سلامتها"];

/**
 * تسلسل العرض (لحظة واحدة منسّقة بدل حركات متفرقة). كل رقم = لحظة جديدة:
 * 1 رسالة المستخدم · 2-5 خطوات التنفيذ (كل خطوة: شغّالة ثم تمّت) · 6 الرد · 7 المعاينة · 8 أول مهمة تتعلّم.
 * الأرقام = التأخير بالـms قبل كل لحظة.
 */
const GAPS = [500, 750, 800, 800, 800, 700, 800, 900];
const LAST = GAPS.length;

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function prefersNoMotion() {
  return (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.classList.contains("no-anim")
  );
}

/** بيشغّل التسلسل مرة واحدة أول ما السكرين يظهر في الشاشة (ولو الحركة معطّلة بيعرض النتيجة النهائية فورًا). */
function useTimeline(ref: RefObject<HTMLElement | null>) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersNoMotion()) {
      setTick(LAST);
      return;
    }
    const timers: number[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        let t = 0;
        GAPS.forEach((gap, i) => {
          t += gap;
          timers.push(window.setTimeout(() => setTick(i + 1), t));
        });
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(window.clearTimeout);
    };
  }, [ref]);

  return tick;
}

function MockChat({ tick, stacked }: { tick: number; stacked: boolean }) {
  return (
    // في العرض العمودي الارتفاع محجوز مسبقًا عشان الصفحة ما تقفزش وإنت بتسكرول والعناصر بتظهر.
    <div className={`flex flex-col gap-3 p-4 text-start ${stacked ? "min-h-[350px]" : "h-full min-h-0"}`}>
      {tick >= 1 && (
        <div className="animate-rise max-w-[88%] self-start rounded-2xl bg-accent-soft px-3.5 py-2.5 text-[13px] leading-6 text-ink">
          أنشئ صفحة لقائمة مهام بسيطة وشغّلها
        </div>
      )}
      {tick >= 2 && (
        <div className="animate-rise rounded-xl border border-hair bg-surface-2">
          <div className="flex items-center gap-2 border-b border-hair px-3 py-2 text-[12px] font-medium text-ink-2">
            <Terminal size={14} />
            خطوات التنفيذ
          </div>
          <ul className="space-y-2 px-3 py-2.5">
            {STEPS.map((s, i) =>
              tick >= 2 + i ? (
                <li key={s} className="animate-rise flex items-center gap-2 text-[12.5px] text-ink-2">
                  {tick >= 3 + i ? (
                    <span className="animate-pop grid h-4 w-4 shrink-0 place-items-center rounded-full bg-live-soft text-live">
                      <Check size={11} strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="animate-spin-slow h-4 w-4 shrink-0 rounded-full border-2 border-hair-2 border-t-accent" />
                  )}
                  {s}
                </li>
              ) : null
            )}
          </ul>
        </div>
      )}
      {tick >= 6 && (
        <p className="animate-rise text-[13px] leading-6 text-ink">
          اكتمل التنفيذ. الصفحة تعمل في المعاينة بجانبك. هل تودّ إضافة وضع داكن أو حفظ المهام؟
        </p>
      )}
      <div className="mt-auto flex items-center gap-2 rounded-full border border-hair bg-surface py-1.5 pe-1.5 ps-4 text-[12.5px] text-ink-3">
        <span className="flex-1">اكتب رسالتك…</span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-ink">
          <ArrowUp size={14} />
        </span>
      </div>
    </div>
  );
}

function MockPreview({ tick, interactive }: { tick: number; interactive: boolean }) {
  const [done, setDone] = useState<number[]>([]);
  const toggle = (i: number) => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));

  // آخر لحظة في التسلسل: أول مهمة بتتعلّم لوحدها، عشان الزائر يشوف إيه اللي بيتغيّر لما يدوس.
  useEffect(() => {
    if (tick >= LAST) setDone((d) => (d.length ? d : [0]));
  }, [tick]);

  const ready = tick >= 7;

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 text-[12px] text-[#6b6b70]">
        <span className={`h-2 w-2 rounded-full transition-colors duration-3 ${ready ? "bg-[#1d9e5b]" : "bg-[#c4c4c9]"}`} />
        معاينة مباشرة
      </div>
      {/* المعاينة صفحة ويب بيضاء دايمًا (زي الحقيقية) فألوانها ثابتة مش بتتبع الثيم */}
      <div className="flex flex-1 items-center justify-center bg-[#f5f5f7] p-5">
        {!ready && <p className="text-[12.5px] text-[#9a9aa0]">ستظهر المعاينة هنا بعد التشغيل</p>}
        {ready && (
          <div className="animate-materialize w-full max-w-[340px] rounded-2xl bg-white p-5 text-start shadow-[0_8px_30px_-12px_rgba(0,0,0,0.25)]">
            <h4 className="text-[19px] font-semibold text-[#1d1d1f]">مهامي</h4>
            <p className="tnum mt-0.5 text-[13px] text-[#6b6b70]">
              {done.length} من {TASKS.length} مكتملة
            </p>
            <ul className="mt-4 space-y-2">
              {TASKS.map((task, i) => {
                const isDone = done.includes(i);
                const inner = (
                  <>
                    <span
                      className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border text-white transition-colors duration-2 ${
                        isDone ? "border-[#0071e3] bg-[#0071e3]" : "border-black/20"
                      }`}
                    >
                      <Check
                        size={12}
                        strokeWidth={3}
                        className={`transition-transform duration-2 ease-spring ${isDone ? "scale-100" : "scale-0"}`}
                      />
                    </span>
                    <span className={`transition-colors duration-2 ${isDone ? "text-[#9a9aa0] line-through" : "text-[#1d1d1f]"}`}>
                      {task}
                    </span>
                  </>
                );
                return (
                  <li key={task} className="animate-rise" style={{ animationDelay: `${180 + i * 90}ms` }}>
                    {interactive ? (
                      <button
                        type="button"
                        onClick={() => toggle(i)}
                        aria-pressed={isDone}
                        className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-start text-[14.5px] hover:bg-black/5"
                      >
                        {inner}
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-2 py-2.5 text-[14.5px]">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function MockWindow({ tick, stacked = false }: { tick: number; stacked?: boolean }) {
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
          <MockChat tick={tick} stacked />
          <div className="h-[330px] border-t border-hair">
            <MockPreview tick={tick} interactive />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="min-h-0 border-e border-hair">
            <MockChat tick={tick} stacked={false} />
          </div>
          <div className="min-h-0">
            <MockPreview tick={tick} interactive />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Showcase() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [stacked, setStacked] = useState(false);
  const tick = useTimeline(wrapRef);

  useIsoLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setStacked(el.clientWidth < STACK_BELOW);
      setScale(Math.min(MAX_SCALE, el.clientWidth / W));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="mx-auto w-full" style={{ maxWidth: W * MAX_SCALE }}>
      {stacked ? (
        <MockWindow stacked tick={tick} />
      ) : (
        <div className="relative" style={{ height: H * scale }}>
          <div
            className="absolute right-0 top-0"
            style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top right" }}
          >
            <MockWindow tick={tick} />
          </div>
        </div>
      )}
    </div>
  );
}
