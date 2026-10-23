/**
 * layout جماعي للصفحات المستقلة (pricing / models / help / privacy / terms / refund).
 * الـ body عامله overflow:hidden عشان الشات (شاشة كاملة بتمرير داخلي) وصفحة الهبوط
 * (حاوية #lp-scroll) — فالصفحات دي محتاجة حاوية تمرير خاصة بيها، وإلا أي محتوى
 * أطول من الشاشة بيتقص من غير تمرير. نفس ستايل حاوية الهبوط بالظبط.
 * ملاحظة: أسماء الـ route groups بأقواس مش بتأثر على الـ URLs.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] overflow-y-auto overscroll-none bg-ground text-ink">
      {children}
    </div>
  );
}
