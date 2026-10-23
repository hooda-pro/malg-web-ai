"use client";

import { useState } from "react";
import { ArrowLeft, Check, Copy, KeyRound, Terminal, Zap } from "lucide-react";
import SectionHeading from "./SectionHeading";

function snippets(site: string) {
  const url = `${site}/api/malg/v1`;
  return {
    cURL: `curl ${url}/chat/completions \\
  -H "Authorization: Bearer $MALG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"messages":[{"role":"user","content":"Hello"}]}'`,
    Python: `import os
from openai import OpenAI

client = OpenAI(
    base_url="${url}",
    api_key=os.environ["MALG_API_KEY"],
)

res = client.chat.completions.create(
    messages=[{"role": "user", "content": "Hello"}],
)
print(res.choices[0].message.content)`,
    "Node.js": `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${url}",
  apiKey: process.env.MALG_API_KEY,
});

const res = await client.chat.completions.create({
  messages: [{ role: "user", content: "Hello" }],
});
console.log(res.choices[0].message.content);`,
  };
}

export default function DeveloperSection({ site }: { site: string }) {
  const all = snippets(site);
  const tabs = Object.keys(all) as (keyof typeof all)[];
  const [tab, setTab] = useState<keyof typeof all>("cURL");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(all[tab]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard غير متاح
    }
  };

  return (
    <section id="developers" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-28" aria-labelledby="dev-title">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <SectionHeading
            id="dev-title"
            align="start"
            eyebrow="للمطورين"
            title="ادمج MALG في أدواتك بسطر واحد"
            body="واجهة برمجية متوافقة مع OpenAI — غيّر الرابط والمفتاح فقط، وكل مكتباتك وأدواتك الحالية تعمل فورًا."
          />
          <ul className="mt-8 space-y-4">
            {[
              { icon: Zap, title: "متوافقة مع OpenAI", body: "تعمل مع Cline وOpenCode وأي SDK يدعم OpenAI." },
              { icon: Terminal, title: "يعمل في بيئتك", body: "شغّل الوكيل على جهازك أو خادمك بمواردك الكاملة." },
              { icon: KeyRound, title: "مفاتيح آمنة", body: "أنشئ المفاتيح وألغِها وتابع استهلاكها من حسابك." },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon size={18} />
                </span>
                <div>
                  <p className="text-[15.5px] font-semibold">{title}</p>
                  <p className="mt-0.5 text-[14px] leading-7 text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ul>
          <a
            href="/#/api"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-ground transition-opacity duration-1 hover:opacity-90"
          >
            احصل على مفتاح API
            <ArrowLeft size={16} />
          </a>
          <a
            href="/models"
            className="mt-8 inline-flex h-12 items-center gap-2 rounded-full border border-hair-2 px-6 text-[15px] font-medium text-ink transition-colors duration-1 hover:bg-surface-2 sm:ms-3"
          >
            النماذج والأسعار
            <ArrowLeft size={16} />
          </a>
        </div>

        <div dir="ltr" className="overflow-hidden rounded-3xl border border-hair bg-[#0c0c0e] text-[#e7e7ea] shadow-3">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div role="tablist" aria-label="لغة المثال" className="flex gap-1">
              {tabs.map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-3 py-1.5 font-mono text-[12.5px] transition-colors duration-1 ${
                    tab === t ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={copy}
              aria-label="نسخ الكود"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/60 transition-colors duration-1 hover:bg-white/10 hover:text-white"
            >
              {copied ? <Check size={15} className="text-[#32d583]" /> : <Copy size={15} />}
            </button>
          </div>
          <pre role="tabpanel" className="min-h-[300px] overflow-x-auto p-5 text-left font-mono text-[13px] leading-7">
            <code>{all[tab]}</code>
          </pre>
        </div>
      </div>
    </section>
  );
}
