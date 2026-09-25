import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import {
  API_TOKEN_PRICE_PER_MILLION,
  RECHARGE_PACKAGES,
  buildRechargeMessage,
  buildWhatsAppLink,
} from "@/lib/recharge";
import { formatTokens } from "@/lib/ai";

export const dynamic = "force-dynamic";

/** صفحة شحن الرصيد — بتستخدم lib/recharge.ts (باقات + رسالة واتساب جاهزة). */
export default function TopUpPage() {
  const user = getSessionUser();
  if (!user) redirect("/");

  return (
    <main className="min-h-[100dvh] bg-ground px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-[860px]">
        <header className="mb-8 text-center">
          <h1 className="text-[clamp(24px,4vw,34px)] font-semibold tracking-display text-ink">
            شحن الرصيد
          </h1>
          <p className="mx-auto mt-2 max-w-[46ch] text-pretty text-[15px] leading-7 text-ink-2">
            اختار الباقة اللي تناسبك وابعت طلب الشحن على واتساب — هنحدّد الرصيد فوراً.
          </p>
          <p className="mt-2 text-[12.5px] text-ink-3" dir="ltr">
            {user.email}
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {RECHARGE_PACKAGES.map((pkg) => (
            <article
              key={pkg.id}
              className="relative flex flex-col rounded-xl border border-hair bg-surface p-5 shadow-1 transition-shadow duration-2 hover:shadow-2"
            >
              {pkg.badge && (
                <span className="absolute -top-2 end-4 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-medium text-accent-ink shadow-accent">
                  {pkg.badge}
                </span>
              )}
              <p className="text-[13px] text-ink-3">
                {pkg.emoji} {pkg.label}
              </p>
              <p className="tnum mt-2 text-[30px] font-semibold leading-none tracking-display text-ink">
                {pkg.price}
                <span className="ms-1 text-[14px] font-normal text-ink-3">جنيه</span>
              </p>
              <p className="mt-2 text-[13px] leading-6 text-ink-2">{pkg.hint}</p>

              <a
                href={buildWhatsAppLink(buildRechargeMessage(pkg, user))}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[14px] font-medium text-accent-ink shadow-accent transition-colors duration-1 hover:bg-accent-hover"
              >
                اطلب الباقة دي
              </a>
            </article>
          ))}
        </div>

        <section className="mt-8 rounded-xl border border-hair bg-surface p-5 shadow-1">
          <h2 className="text-[15px] font-semibold text-ink">رصيد الـ API (للمطوّرين)</h2>
          <p className="mt-1.5 text-[13.5px] leading-6 text-ink-2">
            ده رصيد منفصل تمامًا عن رصيد الشات، بيتعامل معاه من خلال{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[12px]">/api/v1/chat/completions</code>{" "}
            عن طريق مفتاح API. السعر المرجعي{" "}
            <span className="tnum font-medium text-ink">
              {formatTokens(API_TOKEN_PRICE_PER_MILLION)} جنيه
            </span>{" "}
            لكل مليون توكن.
          </p>
          <a
            href={buildWhatsAppLink(buildRechargeMessage(null, user))}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-hair bg-surface-2 px-5 text-[14px] font-medium text-ink transition-colors duration-1 hover:bg-surface-3"
          >
            استفسر عن رصيد API
          </a>
        </section>

        <p className="mt-8 text-center text-[12px] text-ink-3">
          Payments are confirmed manually — إنت هتستلم رصيدك بعد ما الدفعة تتأكد.
        </p>
      </div>
    </main>
  );
}