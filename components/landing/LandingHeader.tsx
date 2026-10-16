"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Menu, X } from "lucide-react";
import Logo from "../Logo";

const NAV = [
  { href: "#features", label: "المميزات" },
  { href: "#how", label: "كيف يعمل" },
  { href: "#plans", label: "الأسعار" },
  { href: "#developers", label: "للمطورين" },
  { href: "#faq", label: "الأسئلة الشائعة" },
];

export default function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const scroller = document.getElementById("lp-scroll");
    if (!scroller) return;
    const onScroll = () => setScrolled(scroller.scrollTop > 8);
    onScroll();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-sticky pt-[env(safe-area-inset-top)] transition-colors duration-2 ${
        scrolled || open ? "glass border-b border-hair" : "border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <a href="/" className="flex items-center gap-2.5" aria-label="MALG — الصفحة الرئيسية">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-ground">
            <Logo size={18} />
          </span>
          <span className="text-[17px] font-semibold tracking-display">MALG</span>
        </a>

        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-full px-3.5 py-2 text-[14px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="/#/chat"
            className="hidden h-10 items-center rounded-full px-4 text-[14px] font-medium text-ink-2 transition-colors duration-1 hover:text-ink sm:inline-flex"
          >
            تسجيل الدخول
          </a>
          <a
            href="/#/chat"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-5 text-[14px] font-medium text-ground transition-opacity duration-1 hover:opacity-90"
          >
            ابدأ مجانًا
            <ArrowLeft size={15} className="hidden sm:block" />
          </a>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="lp-mobile-nav"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            className="grid h-10 w-10 place-items-center rounded-full border border-hair text-ink transition-colors duration-1 hover:bg-surface-2 lg:hidden"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="lp-mobile-nav" aria-label="قائمة الجوال" className="animate-rise border-t border-hair px-5 pb-5 pt-2 lg:hidden">
          <ul className="flex flex-col">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex h-12 items-center border-b border-hair text-[15px] font-medium text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <a
            href="/#/chat"
            className="mt-4 flex h-12 items-center justify-center rounded-full border border-hair-2 text-[15px] font-medium text-ink"
          >
            تسجيل الدخول
          </a>
        </nav>
      )}
    </header>
  );
}
