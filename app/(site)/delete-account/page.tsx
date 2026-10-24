import type { Metadata } from "next";
import DeleteNow from "./DeleteNow";

export const metadata: Metadata = {
  title: "حذف الحساب | MALG",
  description:
    "طلب حذف حساب MALG نهائيًا من الويب — بكل المحادثات وبيانات الحساب، بدون الحاجة لتطبيق الهاتف.",
};

export default function DeleteAccountPage() {
  return (
    <main
      dir="rtl"
      className="mx-auto max-w-3xl px-5 py-10 leading-8 text-[15px]"
    >
      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-hair px-4 py-2 text-[13.5px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
      >
        العودة للرئيسية
      </a>
      <h1 className="mt-6 text-2xl font-bold">حذف الحساب نهائيًا</h1>
      <p className="mt-2 opacity-70">
        يمكن لحسابك في MALG أن يُحذف نهائيًا من هذه الصفحة دون الحاجة إلى
        تطبيق الهاتف.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">ماذا يُحذف؟</h2>
        <ul className="mt-2 list-disc space-y-1 pr-5">
          <li>حسابك كاملًا (البريد الإلكتروني، الاسم، بيانات الملف الشخصي).</li>
          <li>
            جميع المحادثات والرسائل والملفات المرفقة — مع بيانات الحساب ولا
            يمكن استرجاعها.
          </li>
          <li>
            الرصيد المتبقي، الذاكرة، معلوماتك المحفوظة (Facts)، ومفاتيح الـ API.
          </li>
          <li>الرصيد المتبقي وأي اشتراك Pro يُلغى مع الحساب ولا يُعاد قيمته.</li>
        </ul>
        <p className="mt-2 opacity-70">
          الحذف نهائي — بمجرد تأكيده لا يمكن التراجع عنه أو استعادة أي بيانات.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">حذف الحساب الآن</h2>
        <p className="mt-2 opacity-70">
          سجّل الدخول بنفس الحساب إن لم تكن مسجلًا، ثم أكّد الحذف.
        </p>
        <div className="mt-4">
          <DeleteNow />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">طرق أخرى لحذف الحساب</h2>
        <ol className="mt-2 list-decimal space-y-1 pr-5">
          <li>
            داخل التطبيق: الإعدادات ← الحساب ← «حذف الحساب فورًا» أو
            «حذف الحساب» (طلب حذف مع مهلة 30 يومًا).
          </li>
          <li>
            داخل الموقع بعد تسجيل الدخول: الإعدادات ← الحساب، بنفس
            الخيارين السابقين.
          </li>
        </ol>
        <p className="mt-2 opacity-70">
          لأي سؤال عن الحذف أو بياناتك، تواصل معنا عبر واتساب الدعم المعلن
          داخل التطبيق.
        </p>
      </section>
    </main>
  );
}
