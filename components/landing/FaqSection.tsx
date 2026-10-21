import { Plus } from "lucide-react";
import SectionHeading from "./SectionHeading";

const FAQS = [
  {
    q: "هل يمكنني استخدام MALG مجانًا؟",
    a: "نعم. تحصل عند التسجيل على رصيد مجاني يتجدد تلقائيًا دون الحاجة إلى بطاقة ائتمانية، ويمكنك الترقية إلى Pro أو شحن رصيد إضافي متى احتجت.",
  },
  {
    q: "بأي لغة يتحدث MALG؟",
    a: "يتحدث بالعربية الفصحى افتراضيًا، ويمكنك اختيار العامية المصرية من الإعدادات. كما يدعم الإنجليزية والفرنسية والإسبانية لغةً للواجهة والردود.",
  },
  {
    q: "هل يستطيع بناء مواقع وتطبيقات كاملة؟",
    a: "نعم. يكتب الكود وينفّذه في بيئة معزولة، ويعرض النتيجة في معاينة حيّة بجانب المحادثة، ويمكنك طلب التعديلات حتى تصل إلى ما تريده.",
  },
  {
    q: "ما الفرق بين استخدام الموقع والواجهة البرمجية؟",
    a: "الموقع هو أسرع طريقة للبدء دون أي إعداد. أما الواجهة البرمجية فتتيح لك تشغيل MALG داخل أدواتك وعلى جهازك أو خادمك، فتتحكم في الموارد بالكامل وتناسب المشاريع الكبيرة.",
  },
  {
    q: "هل محادثاتي وبياناتي آمنة؟",
    a: "محادثاتك محفوظة في حسابك ولا يراها غيرك، ويمكنك حذفها في أي وقت. وللخصوصية الكاملة يوجد وضع مؤقت لا يحفظ أي شيء.",
  },
  {
    q: "كيف أشترك في باقة Pro؟",
    a: "من داخل حسابك اختر الباقة المناسبة واتبع خطوات الاشتراك، وسيُضاف الرصيد إلى حسابك فور التفعيل.",
  },
];

export default function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-5 py-20 sm:py-28" aria-labelledby="faq-title">
      <SectionHeading id="faq-title" eyebrow="الأسئلة الشائعة" title="لديك سؤال؟ لدينا الإجابة" />
      <div className="mt-12 divide-y divide-hair overflow-hidden rounded-3xl border border-hair bg-surface shadow-1">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="faq-details group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-[15.5px] font-semibold transition-colors duration-1 hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
              {q}
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-hair text-ink-2 transition-transform duration-2 ease-soft group-open:rotate-45">
                <Plus size={15} />
              </span>
            </summary>
            <div className="faq-body">
              <div>
                <p className="px-6 pb-5 text-[14.5px] leading-8 text-ink-2">{a}</p>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
