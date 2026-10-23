import { Check } from "lucide-react";
import { FREE_PLAN, PRO_PLAN, formatUSD } from "@/lib/plans";
import { formatBalance } from "@/lib/ai";
import Reveal from "../Reveal";
import SectionHeading from "./SectionHeading";

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-live-soft text-live">
        <Check size={12} strokeWidth={3} />
      </span>
      <span>{children}</span>
    </li>
  );
}

export default function PricingSection() {
  const yearly = PRO_PLAN.yearlyUSD ?? 0;
  const monthly = PRO_PLAN.monthlyUSD ?? 0;
  const savedMonths = monthly > 0 ? Math.round((monthly * 12 - yearly) / monthly) : 0;

  return (
    <section id="plans" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-28" aria-labelledby="plans-title">
      <SectionHeading
        id="plans-title"
        eyebrow="الأسعار"
        title="ابدأ مجانًا، وارتقِ عندما تحتاج"
        body="بدون بطاقة ائتمانية للبدء. اشترك في Pro متى شئت، واشحن رصيدًا إضافيًا في أي وقت."
      />

      <div className="mx-auto mt-12 grid max-w-4xl gap-4 md:grid-cols-2">
        <Reveal className="flex flex-col rounded-3xl border border-hair bg-surface p-8 shadow-1">
          <h3 className="text-[18px] font-semibold">{FREE_PLAN.name}</h3>
          <p className="mt-1 text-[14px] text-ink-2">للتجربة والاستخدام اليومي الخفيف</p>
          <p className="mt-6 flex items-baseline gap-1.5">
            <span className="tnum text-[44px] font-semibold leading-none tracking-display" dir="ltr">
              $0
            </span>
            <span className="text-[14px] text-ink-3">مجانًا دائمًا</span>
          </p>
          <ul className="mt-8 flex-1 space-y-3 text-[14.5px] leading-6 text-ink-2">
            <Feature>{formatBalance(FREE_PLAN.monthlyBalanceMicro)} رصيد متجدد تلقائيًا</Feature>
            <Feature>الوصول إلى الموديلات المجانية</Feature>
            <Feature>بحث في الويب ومعاينة حيّة</Feature>
            <Feature>محادثات محفوظة في حسابك</Feature>
          </ul>
          <a
            href="/#/chat"
            className="mt-8 inline-flex h-12 items-center justify-center rounded-full border border-hair-2 text-[15px] font-medium text-ink transition-colors duration-1 hover:bg-surface-2"
          >
            ابدأ مجانًا
          </a>
        </Reveal>

        <Reveal delay={90} className="lp-ring relative flex flex-col overflow-hidden rounded-3xl bg-ink p-8 text-ground shadow-3">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 start-1/2 h-56 w-56 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
            style={{ background: "var(--accent)" }}
          />
          <div className="relative flex items-center justify-between">
            <h3 className="text-[18px] font-semibold">{PRO_PLAN.name}</h3>
            <span className="rounded-full bg-accent px-3 py-1 text-[12px] font-semibold text-accent-ink">الأكثر اختيارًا</span>
          </div>
          <p className="relative mt-1 text-[14px] opacity-70">لمن يعتمد على MALG في عمله ودراسته</p>
          <p className="relative mt-6 flex items-baseline gap-1.5">
            <span className="tnum text-[44px] font-semibold leading-none tracking-display" dir="ltr">
              {formatUSD(monthly)}
            </span>
            <span className="text-[14px] opacity-70">/ شهريًا</span>
          </p>
          {yearly > 0 && (
            <p className="relative mt-2 text-[13px] opacity-70">
              أو <span dir="ltr">{formatUSD(yearly)}</span> سنويًا{savedMonths > 0 ? ` — وفّر ${savedMonths === 2 ? "شهرين" : `${savedMonths} أشهر`}` : ""}
            </p>
          )}
          <ul className="relative mt-8 flex-1 space-y-3 text-[14.5px] leading-6 opacity-90">
            <Feature>تسعير بالدولار لكل موديل (In/Out)</Feature>
            <Feature>كل الموديلات، بما فيها الأقوى</Feature>
            <Feature>شحن رصيد إضافي في أي وقت</Feature>
            <Feature>كل مميزات الباقة المجانية</Feature>
          </ul>
          <a
            href="/#/chat"
            className="btn-sheen relative mt-8 inline-flex h-12 items-center justify-center rounded-full bg-accent text-[15px] font-medium text-accent-ink transition-colors duration-1 hover:bg-accent-hover"
          >
            اشترك في Pro
          </a>
        </Reveal>
      </div>

      <p className="mt-6 text-center text-[13.5px] text-ink-3">
        تحتاج تفاصيل باقات الشحن؟{" "}
        <a href="/pricing" className="font-medium text-ink underline decoration-hair-3 underline-offset-4 hover:decoration-ink">
          اطّلع على كل الباقات
        </a>
      </p>
    </section>
  );
}
