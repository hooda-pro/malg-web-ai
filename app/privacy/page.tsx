export const metadata = {
  title: "سياسة الخصوصية",
  description: "سياسة الخصوصية في MALG AI: ما البيانات التي نخزنها، وكيف تُستخدم، وكيف تطلب حذفها.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-ink">
      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-hair px-4 py-2 text-[13.5px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
      >
        العودة للرئيسية
      </a>
      <h1 className="mt-6 text-[28px] font-semibold tracking-display">سياسة الخصوصية</h1>
      <p className="mt-2 text-[14px] text-ink-3">آخر تحديث: أكتوبر 2026</p>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">ما البيانات التي نخزنها؟</h2>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-[15px] leading-8 text-ink-2">
          <li>بيانات حساب Google عند التسجيل: الاسم وعنوان البريد الإلكتروني فقط.</li>
          <li>محادثاتك ورسائلك، محفوظة على قاعدة بيانات Neon Postgres الخاصة بنا.</li>
          <li>إعدادات حسابك (اللغة، الموديل المفضل، الثيم) ورصيدك واشتراكك.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">بيانات الدفع</h2>
        <p className="mt-3 text-[15px] leading-8 text-ink-2">
          لا نخزن أي بيانات بطاقات بنكية. الاشتراك وشحن الرصيد يتم حاليًا يدويًا عبر
          واتساب، والدفع المباشر بالبطاقة عبر الموقع سيُتاح لاحقًا.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">كيف تُستخدم بياناتك؟</h2>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-[15px] leading-8 text-ink-2">
          <li>تشغيل الخدمة: عرض محادثاتك وحفظها ومزامنتها على حسابك.</li>
          <li>إدارة رصيدك واشتراكك وباقات الشحن.</li>
          <li>تحسين الخدمة ومنع إساءة الاستخدام.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">حذف بياناتك</h2>
        <p className="mt-3 text-[15px] leading-8 text-ink-2">
          يمكنك حذف أي محادثة من قائمة المحادثات في أي وقت. لحذف حسابك وكل بياناتك
          نهائيًا، افتح الإعدادات ثم تبويب «البيانات» واختر حذف الحساب، أو تواصل معنا
          وسننفذ طلبك.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">تواصل معنا</h2>
        <p className="mt-3 text-[15px] leading-8 text-ink-2">
          لأي سؤال عن الخصوصية أو طلب متعلق ببياناتك، راسلنا عبر واتساب:{" "}
          <a
            href="https://wa.me/x9_vk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent hover:underline"
          >
            wa.me/x9_vk
          </a>
          .
        </p>
      </section>
    </div>
  );
}
