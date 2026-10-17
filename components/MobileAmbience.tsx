"use client";

import { useEffect, useRef, useState } from "react";

/**
 * طبقة الخَلق على الموبايل فقط ("MALG Pocket"):
 *  • ٣ كرات ضوء عايمة بتنسم ببطء مع parallax خفيف مع السكرول.
 *  • خط تقدم القراءة فوق فوق بيتعبّى مع أي سكرول (صفحة الهبوط/الشات/أي عنصر).
 * كل ده بيتخفى أتمامةً على الديسكتوب/التابلت (≥ 640px) ومع تفضيل
 * "تقليل الحركة" — مش بيرسم إي حاجة خالص في الحالتين.
 */
export default function MobileAmbience() {
  const [enabled, setEnabled] = useState(false);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const parallaxRef = useRef<HTMLDivElement | null>(null);

  /* اشتغل بس على الموبايل + من غير تفضيل تقليل الحركة */
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(mq.matches && !reduce.matches);
    update();
    mq.addEventListener("change", update);
    reduce.addEventListener("change", update);
    return () => {
      mq.removeEventListener("change", update);
      reduce.removeEventListener("change", update);
    };
  }, []);

  /* أي سكرول في الصفحة (حتى جوه حاوية مركّبة) بيجينا بالـcapture —
     وعلى أساسه بنحدّث خط التقدم + الparallax بدون re-render. */
  useEffect(() => {
    if (!enabled) return;
    let ticking = false;
    let scroller: HTMLElement | Window = window;

    const metrics = (el: HTMLElement | Window) => {
      if (el instanceof HTMLElement && el.clientHeight > 240 && el.scrollHeight > el.clientHeight + 8) {
        return { top: el.scrollTop, size: el.scrollHeight - el.clientHeight };
      }
      const doc = document.documentElement;
      return { top: window.scrollY, size: Math.max(0, doc.scrollHeight - window.innerHeight) };
    };

    const onScroll = (e: Event) => {
      const t = e.target;
      if (t instanceof HTMLElement) scroller = t;
      else scroller = window;
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const { top, size } = metrics(scroller);
        const p = size > 0 ? Math.min(1, Math.max(0, top / size)) : 0;
        if (progressRef.current) {
          progressRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
          progressRef.current.style.opacity = p > 0.002 ? "1" : "0";
        }
        if (parallaxRef.current) {
          parallaxRef.current.style.transform = `translate3d(0, ${(top * 0.06).toFixed(1)}px, 0)`;
        }
      });
    };

    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { capture: true, passive: true });
    /* خطوة أولى: حالة نصية (فوق سايت) */
    onScroll(new Event("malg-init"));

    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll, { capture: true });
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none select-none">
      <div ref={parallaxRef} className="malg-m-ambience">
        <span className="malg-m-blob malg-m-blob-a" />
        <span className="malg-m-blob malg-m-blob-b" />
        <span className="malg-m-blob malg-m-blob-c" />
      </div>
      <div ref={progressRef} className="malg-m-progress" />
    </div>
  );
}
