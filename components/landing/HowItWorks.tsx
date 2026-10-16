import { Briefcase, GraduationCap, Megaphone, Rocket } from "lucide-react";
import Reveal from "../Reveal";
import SectionHeading from "./SectionHeading";

const STEPS = [
  { n: "01", title: "صِف ما تريد", body: "اكتب سؤالك أو فكرتك بكلماتك — بالعربية أو بأي لغة تفضّلها." },
  { n: "02", title: "MALG يعمل أمامك", body: "يبحث ويكتب وينفّذ، وتتابع كل خطوة لحظة بلحظة دون انتظار في الظلام." },
  { n: "03", title: "راجع وطوّر", body: "عاين النتيجة واطلب أي تعديل حتى تصل تمامًا إلى ما تريده." },
];

const AUDIENCES = [
  { icon: GraduationCap, title: "الطلاب", body: "شرح مبسّط للدروس، تلخيص المراجع، وأسئلة تدريبية للمذاكرة." },
  { icon: Megaphone, title: "صنّاع المحتوى", body: "أفكار ومنشورات ومقالات جاهزة للنشر بنبرة تناسب جمهورك." },
  { icon: Rocket, title: "رواد الأعمال", body: "صفحات هبوط ونماذج أولية وخطط عمل في دقائق بدل أسابيع." },
  { icon: Briefcase, title: "المطورون", body: "كتابة الكود وتصحيحه، وواجهة برمجية لدمج MALG في أدواتك." },
];

export default function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-y border-hair bg-surface-2 py-20 sm:py-28" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading id="how-title" eyebrow="كيف يعمل" title="من الفكرة إلى النتيجة في ثلاث خطوات" />

        <ol className="relative mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          <span aria-hidden="true" className="absolute inset-x-[16%] top-6 hidden h-px bg-hair-2 md:block" />
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 100} className="relative text-center">
              <span className="tnum relative mx-auto grid h-12 w-12 place-items-center rounded-full border border-hair-2 bg-surface text-[14px] font-semibold text-accent shadow-1">
                {s.n}
              </span>
              <h3 className="mt-5 text-[18px] font-semibold">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-[32ch] text-[14.5px] leading-7 text-ink-2">{s.body}</p>
            </Reveal>
          ))}
        </ol>

        <div className="mt-20">
          <h3 className="text-center text-[15px] font-semibold text-ink-2">مصمّم لكل من يريد إنجاز المزيد</h3>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AUDIENCES.map(({ icon: Icon, title, body }, i) => (
              <Reveal key={title} delay={i * 70} className="lift rounded-3xl border border-hair bg-surface p-6 shadow-1">
                <Icon size={22} className="text-accent" />
                <h4 className="mt-4 text-[16px] font-semibold">{title}</h4>
                <p className="mt-2 text-[14px] leading-7 text-ink-2">{body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
