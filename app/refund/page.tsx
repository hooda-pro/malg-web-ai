import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "سياسة الاسترداد | MALG",
  description: "سياسة استرداد المدفوعات في MALG: التوكنز مسبقة الدفع واشتراك Pro.",
};

export default function RefundPage() {
  return (
    <main
      dir="rtl"
      className="mx-auto max-w-3xl px-5 py-10 leading-8 text-[15px]"
    >
      <h1 className="text-2xl font-bold">سياسة الاسترداد</h1>
      <p className="mt-2 opacity-70">آخر تحديث: أكتوبر 2026</p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">1. المبدأ العام</h2>
        <p className="mt-2">
          جميع عمليات الشراء في MALG مسبقة الدفع: تشحن رصيد توكنز أو تشترك
          في باقة Pro ثم تستخدم الرصيد. الرصيد الذي استُهلك فعليًا في
          المحادثات غير قابل للاسترداد.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">2. التوكنز مسبقة الدفع</h2>
        <p className="mt-2">
          رصيد التوكنز المشحون وغير المستخدم بالكامل قابل للاسترداد خلال 14
          يومًا من تاريخ الشراء، بشرط عدم استهلاك أي جزء منه.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">3. اشتراك Pro</h2>
        <p className="mt-2">
          اشتراك Pro الشهري غير المستخدم (لم تستهلك من رصيده شيئًا) قابل
          للاسترداد خلال 14 يومًا من تاريخ الاشتراك. بعد بدء الاستخدام لا
          يمكن استرداد المبلغ المتبقي من الشهر.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">4. كيفية طلب الاسترداد</h2>
        <ol className="mt-2 list-decimal space-y-1 pr-5">
          <li>تواصل معنا عبر واتساب الدعم المعلن داخل التطبيق.</li>
          <li>اذكر البريد الإلكتروني المسجل وتاريخ الشراء.</li>
          <li>نراجع الطلب ونرد عليك خلال 3 أيام عمل.</li>
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">5. استثناءات</h2>
        <ul className="mt-2 list-disc space-y-1 pr-5">
          <li>الحسابات المحظورة بسبب إساءة الاستخدام لا تستحق استردادًا.</li>
          <li>الرصيد المجاني لا قيمة نقدية له ولا يُسترد.</li>
        </ul>
      </section>
    </main>
  );
}
