import { cn } from "@/lib/utils";

/**
 * علامة MALG كقناع CSS على public/logo-mark.png (PNG شفاف).
 * اللون = currentColor، فالعلامة تتبع لون النص في أي ثيم أو سطح.
 * سابقًا كانت صورة بخلفية بيضاء تُخفى بـ mix-blend-mode، والمزج ده بيتكسر
 * جوه أي عنصر عليه animation/transform/backdrop-filter (المودالات، الرسائل،
 * الهيدر الزجاجي) فكان بيظهر "مربع أبيض" لحظيًا ويختفي.
 */
export default function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="MALG"
      className={cn("logo-mark inline-block shrink-0 select-none", className)}
      style={{ width: size, height: size }}
    />
  );
}
