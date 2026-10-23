import { FREE_PLAN, PRO_PLAN, formatUSD } from "@/lib/plans";
import { RECHARGE_PACKAGES, EGP_PER_USD } from "@/lib/recharge";
import { formatBalance } from "@/lib/ai";

export const metadata = {
  title: "الباقات والأسعار",
  description: "باقات MALG AI وأسعارها: الباقة المجانية، باقة Pro، وباقات شحن الرصيد الإضافي.",
};

// رابط واتساب للدعم — يطابق WHATSAPP_USERNAME الافتراضي في lib/recharge.ts.
function waLink(msg: string): string {
  return `https://wa.me/x9_vk?text=${encodeURIComponent(msg)}`;
}

export default function PricingPage() {
  const subscribeLink = waLink(`مرحباً، أرغب في الاشتراك في باقة ${PRO_PLAN.name} في موقع MALG AI`);
  const topupLink = waLink("مرحباً، أرغب في شحن رصيد في موقع MALG AI");

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-ink">
      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-hair px-4 py-2 text-[13.5px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
      >
        العودة للرئيسية
      </a>
      <h1 className="mt-6 text-[28px] font-semibold tracking-display">الباقات والأسعار</h1>
      <p className="mt-2 text-[15px] leading-8 text-ink-2">
        ابدأ مجانًا، وانتقل إلى Pro عندما تحتاج المزيد. فريقنا يفعّل اشتراكك أو رصيدك
        مباشرة عبر واتساب خلال وقت قصير.
      </p>

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-hair bg-surface p-6 shadow-1">
          <h2 className="text-[17px] font-semibold">{FREE_PLAN.name}</h2>
          <p className="mt-3">
            <span className="tnum text-[30px] font-semibold tracking-display" dir="ltr">
              $0
            </span>
            <span className="text-[14px] text-ink-3"> / للأبد</span>
          </p>
          <ul className="mt-4 space-y-2 text-[14.5px] leading-7 text-ink-2">
            <li>✓ {formatBalance(FREE_PLAN.monthlyBalanceMicro)} رصيد متجدد</li>
            <li>✓ الموديلات المجانية</li>
            <li>✓ تجديد تلقائي للرصيد الأساسي</li>
          </ul>
          <a
            href="/#/chat"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full border border-hair-2 px-6 text-[14.5px] font-medium text-ink transition-colors duration-1 hover:bg-surface-2"
          >
            ابدأ مجانًا
          </a>
        </div>

        <div className="rounded-2xl border border-accent-line bg-surface p-6 shadow-2">
          <h2 className="flex items-center gap-2 text-[17px] font-semibold">
            {PRO_PLAN.name}
            <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">
              ★
            </span>
          </h2>
          <p className="mt-3">
            <span className="tnum text-[30px] font-semibold tracking-display" dir="ltr">
              {formatUSD(PRO_PLAN.monthlyUSD ?? 0)}
            </span>
            <span className="text-[14px] text-ink-3"> / شهريًا</span>
          </p>
          <p className="mt-1 text-[13.5px] text-ink-3">
            أو{" "}
            <span className="tnum font-semibold text-ink-2" dir="ltr">
              {formatUSD(PRO_PLAN.yearlyUSD ?? 0)}
            </span>{" "}
            سنويًا
          </p>
          <ul className="mt-4 space-y-2 text-[14.5px] leading-7 text-ink-2">
            <li>✓ تسعير بالدولار لكل موديل (In/Out)</li>
            <li>✓ كل الموديلات بما فيها المدفوعة</li>
            <li>✓ شحن إضافي في أي وقت</li>
          </ul>
          <a
            href={subscribeLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-accent px-6 text-[14.5px] font-medium text-accent-ink transition-colors duration-1 hover:bg-accent-hover"
          >
            اشترك عبر واتساب
          </a>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-[19px] font-semibold">باقات الشحن الإضافي</h2>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          رصيد إضافي يُضاف على باقتك في أي وقت — بيتشترى بالدولار وبيتدفع بالجنيه المصري بسعر
          {" "}{EGP_PER_USD} جنيه لكل دولار (شامل الرسوم).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {RECHARGE_PACKAGES.map((pkg) => (
            <div key={pkg.id} className="rounded-2xl border border-hair bg-surface p-5 shadow-1">
              <h3 className="text-[15.5px] font-semibold">
                {pkg.emoji} {pkg.label}
                {pkg.badge && (
                  <span className="ms-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                    {pkg.badge}
                  </span>
                )}
              </h3>
              <p className="tnum mt-2 text-[14px] text-ink-2">
                {formatBalance(pkg.balanceMicro)} — {pkg.price} جنيه
              </p>
              <p className="mt-1 text-[13px] leading-6 text-ink-3">{pkg.hint}</p>
            </div>
          ))}
        </div>
        <a
          href={topupLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-accent px-6 text-[14.5px] font-medium text-accent-ink transition-colors duration-1 hover:bg-accent-hover"
        >
          اطلب الشحن عبر واتساب
        </a>
        <p className="tnum mt-3 text-[13px] text-ink-3" dir="ltr">
          https://wa.me/x9_vk
        </p>
      </section>

      <section className="mt-10 rounded-2xl border border-hair bg-surface-2 p-5 text-[14px] leading-8 text-ink-2">
        ملحوظة: الدفع حاليًا يدوي عبر واتساب، وخدمة الدفع المباشر بالبطاقة عبر الموقع
        ستُتاح لاحقًا. عايز تفاصيل أسعار كل نموذج بالدولار لكل مليون وحدة؟{" "}
        <a href="/models" className="font-medium text-accent hover:underline">
          صفحة النماذج والأسعار
        </a>
        .
      </section>
    </div>
  );
}
