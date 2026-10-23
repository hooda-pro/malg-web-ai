export const metadata = {
  title: "شروط الاستخدام",
  description: "شروط استخدام MALG AI: الاستخدام المقبول، الحصص، الضمان، وإدارة الحساب.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-ink">
      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-hair px-4 py-2 text-[13.5px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
      >
        العودة للرئيسية
      </a>
      <h1 className="mt-6 text-[28px] font-semibold tracking-display">شروط الاستخدام</h1>
      <p className="mt-2 text-[14px] text-ink-3">آخر تحديث: أكتوبر 2026</p>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">الاستخدام المقبول</h2>
        <ul className="mt-3 list-disc space-y-2 ps-5 text-[15px] leading-8 text-ink-2">
          <li>استخدم الخدمة لأغراض مشروعة فقط: أسئلة، كتابة، برمجة، وبناء مشاريع.</li>
          <li>يُمنع إنتاج أو نشر محتوى ضار أو مسيء أو مخالف للقانون.</li>
          <li>يُمنع محاولة اختراق الخدمة أو تجاوز أنظمة الحصص والفوترة.</li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">الحصص والاشتراكات</h2>
        <p className="mt-3 text-[15px] leading-8 text-ink-2">
          كل حساب يحصل على رصيد توكنز حسب باقته، ويُستهلك الرصيد مع كل رسالة حسب طول
          المحادثة والموديل المستخدم. الباقة المجانية تتجدد تلقائيًا بعد النفاد،
          وباقة Pro تمنح رصيدًا شهريًا أكبر مع إمكانية شحن رصيد إضافي في أي وقت.
          الأسعار والحصص التفصيلية في صفحة{" "}
          <a href="/pricing" className="font-medium text-accent hover:underline">
            الباقات
          </a>
          .
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">لا ضمان</h2>
        <p className="mt-3 text-[15px] leading-8 text-ink-2">
          الخدمة تُقدم «كما هي» دون أي ضمان. ردود الذكاء الاصطناعي قد تحتوي على أخطاء،
          فراجع أي معلومة أو كود قبل الاعتماد عليه. تنفيذ الكود يتم في بيئة معزولة
          بموارد محدودة، وقد تفشل بعض الأوامر أو تختلف النتائج عن بيئتك الخاصة.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">إساءة الاستخدام والحظر</h2>
        <p className="mt-3 text-[15px] leading-8 text-ink-2">
          نحتفظ بالحق في تقييد أو إيقاف أي حساب يسيء استخدام الخدمة — بما في ذلك
          الاستغلال الآلي المفرط، أو المحتوى المخالف، أو التلاعب بالفوترة — دون إشعار
          مسبق في الحالات الجسيمة.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-[18px] font-semibold">حذف الحساب</h2>
        <p className="mt-3 text-[15px] leading-8 text-ink-2">
          يمكنك حذف حسابك وكل بياناتك نهائيًا من الإعدادات عبر تبويب «البيانات» في أي
          وقت. حذف الحساب نهائي ولا يمكن التراجع عنه، ويوقف أي اشتراك نشط.
        </p>
      </section>
    </div>
  );
}
