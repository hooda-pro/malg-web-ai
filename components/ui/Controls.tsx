"use client";

import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ============================================================================
   Shared controls.
   One button/field/switch language for the whole product — Vercel-grade
   geometry (hairline borders, restrained fills, springy press feedback)
   wrapped in Apple-grade spacing and motion.
   ========================================================================= */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover shadow-accent hover:shadow-[0_10px_28px_-10px_var(--accent-line)]",
  secondary:
    "bg-surface text-ink border border-hair hover:bg-surface-3 hover:border-hair-2 shadow-1",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-3",
  danger: "bg-danger text-white hover:brightness-110",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-[13px]",
  md: "h-10 px-5 text-[14px]",
  lg: "h-12 px-7 text-[15px]",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-full font-medium tracking-label",
        "transition-[transform,background-color,border-color,box-shadow,color] duration-1 ease-soft",
        "active:scale-[0.975] disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    />
  );
}

export function IconButton({
  label,
  size = "md",
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md" | "lg";
}) {
  const box = { sm: "h-8 w-8", md: "h-9 w-9", lg: "h-11 w-11" }[size];
  return (
    <button
      {...rest}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full text-ink-2",
        "transition-[transform,background-color,color] duration-1 ease-soft",
        "hover:bg-surface-3 hover:text-ink active:scale-[0.94]",
        "disabled:pointer-events-none disabled:opacity-40",
        box,
        className
      )}
    >
      {children}
    </button>
  );
}

/** macOS-style segmented control: one track, one selection. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex items-center gap-0.5 rounded-full bg-surface-3 p-1", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-full font-medium tracking-label transition-all duration-2 ease-soft",
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-9 px-4 text-[13.5px]",
              active ? "bg-surface text-ink shadow-1" : "text-ink-2 hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-2 ease-soft",
        checked ? "bg-accent" : "bg-hair-2"
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-1",
          "transition-[inset-inline-start] duration-2 ease-spring",
          checked ? "start-[20px]" : "start-[2px]"
        )}
      />
    </button>
  );
}
export function Field({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium tracking-label text-ink-2">
        {label}
      </span>
      <input
        {...rest}
        className={cn(
          "h-11 w-full rounded-md border border-hair bg-surface-2 px-3.5 text-[14.5px]",
          "text-ink placeholder:text-ink-3 transition-all duration-1 ease-soft",
          "hover:border-hair-2 focus:border-accent focus:bg-surface focus:outline-none",
          "focus:shadow-[0_0_0_3.5px_var(--accent-soft)]",
          className
        )}
      />
    </label>
  );
}

/** Grouped-list block: siblings live on ONE surface separated by hairlines. */
export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-hair bg-surface shadow-1",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Row({
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...rest}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-3 text-start transition-colors duration-1",
        "hover:bg-surface-3 active:bg-surface-inset",
        "[&:not(:first-child)]:border-t [&:not(:first-child)]:border-hair",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Centered dialog on desktop, bottom sheet on mobile. Escape + scrim close. */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  labelledBy = "mlag-dialog-title",
  className,
  size = "sm",
  bodyClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  labelledBy?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  bodyClassName?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      const card = cardRef.current;
      const target =
        card?.querySelector<HTMLElement>("input, textarea, select") ??
        card?.querySelector<HTMLElement>("[data-autofocus]") ??
        card?.querySelector<HTMLElement>("button");
      target?.focus();
    }, 60);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-modal flex items-end justify-center sm:items-center"
      role="presentation"
    >
      <div
        className="animate-fade absolute inset-0 bg-black/25 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          "animate-sheet-in sm:animate-materialize glass relative flex max-h-[92dvh] w-full flex-col",
          "rounded-t-3xl border border-hair shadow-3 sm:rounded-3xl",
          { sm: "sm:max-w-[420px]", md: "sm:max-w-[560px]", lg: "sm:max-w-[780px]" }[size],
          className
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-6">
          <div className="min-w-0">
            <h2
              id={labelledBy}
              className="text-balance text-[20px] font-semibold tracking-title text-ink"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="mt-1 text-pretty text-[13.5px] leading-6 text-ink-2">{subtitle}</p>
            )}
          </div>
          <IconButton label="Close" onClick={onClose} size="sm" className="-me-2 -mt-1">
            <X size={17} />
          </IconButton>
        </div>
        <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName ?? "px-6 pb-2")}>
          {children}
        </div>
        {footer && (
          <div className="border-t border-hair px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/** مفتاح كيبورد صغير لعرض الاختصارات */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      dir="ltr"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-hair bg-surface-2 px-1.5",
        "font-sans text-[11px] font-medium leading-none text-ink-3 shadow-edge",
        className
      )}
    >
      {children}
    </kbd>
  );
}

/** بيرجع "⌘" على الماك و"Ctrl" على باقي الأنظمة */
export function modKeyLabel(): string {
  if (typeof navigator === "undefined") return "Ctrl";
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
}
