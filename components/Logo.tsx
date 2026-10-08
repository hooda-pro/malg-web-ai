/**
 * علامة MALG الجديدة — ثلاثة أقواس دائرية بحواف مستديرة (pinwheel) تحاكي
 * اللوجو المعتمد. تستخدم currentColor فتتكيف مع الفاتح/الداكن تلقائيًا
 * (أسود على الفاتح، أبيض على الداكن أو داخل الصناديق الملونة).
 */
export default function Logo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle
        cx="32"
        cy="32"
        r="19"
        stroke="currentColor"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray="28 11.8"
        transform="rotate(303 32 32)"
      />
    </svg>
  );
}
