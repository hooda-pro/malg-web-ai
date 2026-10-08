import { cn } from "@/lib/utils";

/**
 * علامة MALG الأصلية (public/logo.png — مقصوصة من ملف اللوجو المعتمد).
 * الخلفية البيضاء تُخفى تلقائيًا بتقنية المزج:
 * - الفاتح: multiply (الأبيض يختفي، الأسود يظهر)
 * - الداكن: invert + screen (العلامة تظهر بيضاء بدون صندوق)
 * فتندمج على أي سطح — بما فيها الصناديق الملونة — من غير أي صندوق أبيض.
 */
export default function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      width={size}
      height={size}
      className={cn("logo-img shrink-0 select-none", className)}
    />
  );
}
