/**
 * علامة MALG الجديدة — ثلاث ريش منحنية (pinwheel) برؤوس مدببة وحافة خارجية
 * عريضة، تحاكي اللوجو المعتمد. تستخدم currentColor فتتكيف مع الفاتح/الداكن
 * تلقائيًا (أسود على الفاتح، أبيض على الداكن أو داخل الصناديق الملونة).
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
      <g transform="rotate(-25 32 32)">
        <defs>
          <path
            id="malg-blade"
            d="M 10.7 17.1 A 26 26 0 0 1 53.3 17.1 L 39.5 21.4 A 13 13 0 0 0 24.5 21.4 Z"
          />
        </defs>
        <use
          href="#malg-blade"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <use
          href="#malg-blade"
          transform="rotate(120 32 32)"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <use
          href="#malg-blade"
          transform="rotate(240 32 32)"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
