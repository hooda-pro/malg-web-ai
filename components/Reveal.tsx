"use client";

import { useEffect, useRef, useState } from "react";
import type { ElementType, ReactNode } from "react";

/**
 * بيظهّر العنصر بحركة خفيفة أول ما يدخل الشاشة وإنت بتسكرول (مرة واحدة).
 * - العناصر اللي ظاهرة أصلًا عند التحميل بتفضل زي ما هي من غير حركة.
 * - من غير JavaScript أو مع تفضيل "تقليل الحركة" المحتوى بيفضل ظاهر عادي.
 */
export default function Reveal({
  as = "div",
  delay = 0,
  className = "",
  children,
}: {
  as?: "div" | "article" | "li" | "section";
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  const Tag = as as ElementType;
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"visible" | "hidden" | "shown">("visible");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const noMotion =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("no-anim");
    if (noMotion || el.getBoundingClientRect().top < window.innerHeight) return;

    setState("hidden");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        setState("shown");
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`${className} ${state === "hidden" ? "opacity-0" : ""} ${state === "shown" ? "animate-rise" : ""}`}
      style={state === "shown" && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
