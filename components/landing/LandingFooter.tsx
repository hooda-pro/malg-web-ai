import Logo from "../Logo";

const COLUMNS = [
  {
    title: "المنتج",
    links: [
      { href: "#features", label: "المميزات" },
      { href: "#how", label: "كيف يعمل" },
      { href: "/pricing", label: "الأسعار" },
      { href: "/#/chat", label: "ابدأ المحادثة" },
    ],
  },
  {
    title: "للمطورين",
    links: [
      { href: "#developers", label: "الواجهة البرمجية" },
      { href: "/#/api", label: "مفاتيح API" },
    ],
  },
  {
    title: "قانوني",
    links: [
      { href: "/privacy", label: "سياسة الخصوصية" },
      { href: "/terms", label: "شروط الاستخدام" },
      { href: "#faq", label: "الأسئلة الشائعة" },
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer className="border-t border-hair pb-[max(2rem,env(safe-area-inset-bottom))] pt-14">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <span className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-ground">
              <Logo size={18} />
            </span>
            <span className="text-[17px] font-semibold tracking-display">MALG</span>
          </span>
          <p className="mt-4 max-w-[34ch] text-[14px] leading-7 text-ink-2">
            مساعدك الذكي للكتابة والبحث والبرمجة — مصمّم للمستخدم العربي أولًا.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="text-[13px] font-semibold text-ink">{col.title}</p>
            <ul className="mt-4 space-y-3">
              {col.links.map((l) => (
                <li key={l.href + l.label}>
                  <a href={l.href} className="text-[14px] text-ink-2 transition-colors duration-1 hover:text-ink">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-hair px-5 pt-6 text-[13px] text-ink-3">
        <span>© {new Date().getFullYear()} MALG. جميع الحقوق محفوظة.</span>
        <span>صُنع بعناية للمستخدم العربي</span>
      </div>
    </footer>
  );
}
