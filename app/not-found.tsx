import Link from "next/link";
import { Sparkles } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-ground px-6">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-ink shadow-accent">
          <Sparkles size={22} />
        </span>
        <p className="tnum mt-6 text-[13px] font-medium uppercase tracking-micro text-ink-3">404</p>
        <h1 className="mt-2 text-balance text-[clamp(24px,4vw,34px)] font-semibold tracking-display text-ink">
          الصفحة دي مش موجودة
        </h1>
        <p dir="auto" className="mx-auto mt-3 max-w-[42ch] text-pretty text-[15px] leading-7 text-ink-2">
          The page you are looking for doesn&apos;t exist or has moved. Head back to mlag AI and keep
          building.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-11 items-center justify-center rounded-full bg-accent px-6 text-[14px] font-medium text-accent-ink shadow-accent transition-colors duration-1 ease-soft hover:bg-accent-hover"
        >
          ارجع للرئيسية · Back to mlag AI
        </Link>
      </div>
    </main>
  );
}
