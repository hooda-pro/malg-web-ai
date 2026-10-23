import type { Metadata } from "next";
import { FREE_PLAN, PRO_PLAN, formatUSD } from "@/lib/plans";
import { formatBalance } from "@/lib/ai";

export const metadata: Metadata = {
  title: "المساعدة — MALG AI",
  description:
    "دليل MALG AI المختصر: إيه هو MALG AI، إزاي تبدأ، الرصيد والباقات، النماذج، المطورين API، والسياسات — كل حاجة في مكان واحد مع روابط للتفاصيل.",
};

/**
 * صفحة المساعدة — صفحة عامة لأي حد (مسجّل أو زائر أو حتى أداة ذكاء اصطناعي بتقرا الصفحة):
 * كل حاجة عن المنصة بشكل مختصر ومنظم، وكل قسم فيه توجيه للصفحة اللي فيها التفاصيل.
 */
export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 text-ink">
      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-hair px-4 py-2 text-[13.5px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
      >
        العودة للرئيسية
      </a>
      <h1 className="mt-6 text-[28px] font-semibold tracking-display">المساعدة</h1>
      <p className="mt-2 text-[15px] leading-8 text-ink-2">
        كل اللي محتاج تعرفه عن MALG AI في صفحة واحدة — مختصر ومنظم، وكل قسم فيه رابط
        للتفاصيل الكاملة.
      </p>

      {/* ——— إيه هو MALG AI ——— */}
      <section className="mt-10" aria-labelledby="help-what">
        <h2 id="help-what" className="text-[19px] font-semibold">
          إيه هو MALG AI؟
        </h2>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          مساعد ذكاء اصطناعي ذكي: يجاوب على أسئلتك، يساعدك في الكتابة والبرمجة وبناء المشاريع،
          بيستقبل ملفات وصور، وبينفذ كود حي. منصة MALG كلها (الواجهة والحسابات والأدوات) من
          تطوير <strong className="text-ink">محمود أحمد سعيد</strong> — مطوّر فرد، مش شركة.
        </p>
      </section>

      {/* ——— إزاي تبدأ ——— */}
      <section className="mt-8" aria-labelledby="help-start">
        <h2 id="help-start" className="text-[19px] font-semibold">
          إزاي تبدأ؟
        </h2>
        <ol className="mt-3 space-y-2 text-[14.5px] leading-8 text-ink-2">
          <li>
            1. <a href="/#/chat" className="font-medium text-accent hover:underline">افتح الشات</a> —
            أول ما تدخل هتلاقي خانة كتابة، اكتب سؤالك وابعت.
          </li>
          <li>
            2. سجّل حساب مجاني عشان محادثاتك تتحفظ على السيرفر وتقدر ترجعلها من أي جهاز.
          </li>
          <li>
            3. من قايمة حسابك (آخر القايمة الجانبية) تقدر تخصص المساعد، تشوف رصيدك، وتعدّل
            إعداداتك.
          </li>
        </ol>
      </section>

      {/* ——— الرصيد والباقات ——— */}
      <section className="mt-8" aria-labelledby="help-pricing">
        <h2 id="help-pricing" className="text-[19px] font-semibold">
          الرصيد والباقات
        </h2>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          الحساب الجديد بيبدأ برصيد مجاني {formatBalance(FREE_PLAN.monthlyBalanceMicro)} بيتجدد
          تلقائيًا كل 30 يوم بعد النفاد. باقة Pro بـ{" "}
          {formatUSD(PRO_PLAN.monthlyUSD ?? 0)} شهريًا بتفتح كل الموديلات بما فيها المدفوعة،
          والشحن الإضافي متاح في أي وقت.
        </p>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          التفاصيل الكاملة في{" "}
          <a href="/pricing" className="font-medium text-accent hover:underline">
            صفحة الباقات والأسعار
          </a>{" "}
          — وأسعار كل نموذج بالدولار لكل مليون وحدة في{" "}
          <a href="/models" className="font-medium text-accent hover:underline">
            صفحة النماذج
          </a>
          .
        </p>
      </section>

      {/* ——— النماذج ——— */}
      <section className="mt-8" aria-labelledby="help-models">
        <h2 id="help-models" className="text-[19px] font-semibold">
          النماذج
        </h2>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          لكل نموذج سعر إدخال وإخراج بالدولار لكل مليون وحدة، والخصم بيحصل حسب استهلاكك الفعلي.
          النماذج المجانية من غير خصم. من قايمة الموديلات تحت خانة الكتابة تقدر تبدّل بينهم في أي
          وقت.
        </p>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          القايمة الكاملة بالأسعار في{" "}
          <a href="/models" className="font-medium text-accent hover:underline">
            صفحة النماذج والأسعار
          </a>
          .
        </p>
      </section>

      {/* ——— للمطورين ——— */}
      <section className="mt-8" aria-labelledby="help-devs">
        <h2 id="help-devs" className="text-[19px] font-semibold">
          للمطورين (API)
        </h2>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          لو بتبني تطبيق أو أداة، تقدر توصل لـ MALG AI عبر API متوافق مع OpenAI: اعمل مفتاح
          من{" "}
          <a href="/#/api" className="font-medium text-accent hover:underline">
            لوحة مفاتيح API
          </a>{" "}
          واستخدم الـ endpoint بتاعنا.
        </p>
      </section>

      {/* ——— الخصوصية والأمان ——— */}
      <section className="mt-8" aria-labelledby="help-privacy">
        <h2 id="help-privacy" className="text-[19px] font-semibold">
          الخصوصية والأمان
        </h2>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          محادثاتك محفوظة على السيرفر ومرتبطة بحسابك بس، وتقدر تصدّرها أو تمسحها في أي وقت من
          إعدادات «البيانات». التفاصيل في{" "}
          <a href="/privacy" className="font-medium text-accent hover:underline">
            سياسة الخصوصية
          </a>{" "}
          و{" "}
          <a href="/terms" className="font-medium text-accent hover:underline">
            شروط الاستخدام
          </a>
          .
        </p>
      </section>

      {/* ——— الدعم ——— */}
      <section className="mt-8" aria-labelledby="help-support">
        <h2 id="help-support" className="text-[19px] font-semibold">
          الدعم والتواصل
        </h2>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          أي مشكلة أو استفسار — كلمنا واتساب:{" "}
          <a
            href="https://wa.me/x9_vk"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent hover:underline"
          >
            https://wa.me/x9_vk
          </a>
          . وسياسة الاسترجاع في{" "}
          <a href="/refund" className="font-medium text-accent hover:underline">
            صفحة سياسة الاسترجاع
          </a>
          .
        </p>
      </section>

      {/* ——— روابط سريعة ——— */}
      <section className="mt-10 rounded-2xl border border-hair bg-surface-2 p-5" aria-labelledby="help-links">
        <h2 id="help-links" className="text-[17px] font-semibold">
          روابط سريعة
        </h2>
        <ul className="mt-3 grid gap-2 text-[14.5px] sm:grid-cols-2">
          <li>
            <a href="/#/chat" className="text-accent hover:underline">→ افتح الشات</a>
          </li>
          <li>
            <a href="/pricing" className="text-accent hover:underline">→ الباقات والأسعار</a>
          </li>
          <li>
            <a href="/models" className="text-accent hover:underline">→ النماذج والأسعار</a>
          </li>
          <li>
            <a href="/#/api" className="text-accent hover:underline">→ مفاتيح API</a>
          </li>
          <li>
            <a href="/privacy" className="text-accent hover:underline">→ سياسة الخصوصية</a>
          </li>
          <li>
            <a href="/terms" className="text-accent hover:underline">→ شروط الاستخدام</a>
          </li>
          <li>
            <a href="/refund" className="text-accent hover:underline">→ سياسة الاسترجاع</a>
          </li>
          <li>
            <a href="/welcome" className="text-accent hover:underline">→ صفحة الهبوط (التعريف الكامل)</a>
          </li>
        </ul>
      </section>
    </div>
  );
}
