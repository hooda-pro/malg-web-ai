import type { Metadata } from "next";
import { ensureSchema } from "@/lib/db";
import { sql } from "@/lib/db";
import { formatBalance } from "@/lib/ai";

export const metadata: Metadata = {
  title: "النماذج والأسعار — MALG AI",
  description:
    "كل نماذج MALG AI المتاحة: الأسعار بالدولار لكل مليون وحدة (إدخال/إخراج)، المجاني والمدفوع، ودليل ربط الـAPI خطوة بخطوة.",
};

export const dynamic = "force-dynamic";

interface ModelRow {
  id: string;
  name: string;
  description: string | null;
  tier: string | null;
  price_in_usd: unknown;
  price_out_usd: unknown;
  profit_usd: unknown;
  context_note: unknown;
  modality: unknown;
  is_default: boolean | null;
}

/** عرض سعر بالدولار من micro-dollar — نفس منطق fmtPrice في لوحة الأدمن */
function fmtPrice(micro: unknown): string {
  const usd = Math.max(Number(micro) || 0, 0) / 1_000_000;
  if (usd === 0) return "0";
  return usd >= 0.01 ? String(Math.round(usd * 100) / 100) : String(Math.round(usd * 1000) / 1000);
}

function Ctx({ note }: { note: string }) {
  if (!note) return null;
  return (
    <span className="tnum rounded-full bg-surface-3 px-2 py-0.5 text-[10.5px] font-medium text-ink-3" title="حجم نافذة السياق">
      {note} سياق
    </span>
  );
}

export default async function ModelsPage() {
  let models: ModelRow[] = [];
  let dbError = false;
  try {
    await ensureSchema();
    models = (await sql`
      SELECT id, name, description, tier, price_in_usd, price_out_usd, profit_usd, context_note, modality, is_default
      FROM ai_models
      WHERE is_active = TRUE AND (modality IS NULL OR modality = 'chat')
      ORDER BY is_default DESC, sort_order ASC, created_at ASC
    `) as ModelRow[];
  } catch {
    dbError = true;
  }

  const rows = models.filter((m) => !/voice/i.test(String(m.id || "")));
  const free = rows.filter((m) => !(Number(m.price_in_usd) > 0 || Number(m.price_out_usd) > 0));
  const paid = rows.filter((m) => Number(m.price_in_usd) > 0 || Number(m.price_out_usd) > 0);

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 text-ink">
      <a
        href="/"
        className="inline-flex items-center gap-2 rounded-full border border-hair px-4 py-2 text-[13.5px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-2 hover:text-ink"
      >
        العودة للرئيسية
      </a>
      <h1 className="mt-6 text-[28px] font-semibold tracking-display">النماذج والأسعار</h1>
      <p className="mt-2 text-[15px] leading-8 text-ink-2">
        كل نموذج متاح على MALG بسعره بالدولار لكل مليون وحدة (إدخال/إخراج). النماذج المجانية بتُخصم منها
        صفر — والمدفوعة بتُخصم من رصيدك بالدولار حسب استهلاكك الفعلي.
      </p>

      {dbError && (
        <p className="mt-6 rounded-2xl border border-warn/30 bg-warn-soft px-5 py-4 text-[14px] leading-7 text-warn">
          تعذّر تحميل قائمة النماذج حاليًا — جرّب تحديث الصفحة بعد قليل.
        </p>
      )}

      {/* ——— النماذج المجانية ——— */}
      {free.length > 0 && (
        <section className="mt-10" aria-labelledby="free-models">
          <h2 id="free-models" className="text-[19px] font-semibold">
            النماذج المجانية <span className="tnum text-[14px] font-normal text-ink-3">({free.length})</span>
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-3">متاحة لكل المستخدمين — بدون خصم من الرصيد.</p>
          <div className="mt-4 grid gap-3">
            {free.map((m) => (
              <div key={m.id} className="rounded-2xl border border-hair bg-surface p-5 shadow-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[15.5px] font-semibold">{m.name}</h3>
                  {m.is_default && (
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent">افتراضي</span>
                  )}
                  <span className="rounded-full bg-live-soft px-2 py-0.5 text-[10.5px] font-medium text-live">مجاني</span>
                  <Ctx note={typeof m.context_note === "string" ? m.context_note : ""} />
                </div>
                {m.description && <p className="mt-2 text-[13.5px] leading-7 text-ink-2">{m.description}</p>}
                <p className="tnum mt-2 text-[12px] text-ink-3" dir="ltr">
                  ${fmtPrice(m.price_in_usd)} in / ${fmtPrice(m.price_out_usd)} out per 1M units
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ——— النماذج المدفوعة ——— */}
      {paid.length > 0 && (
        <section className="mt-10" aria-labelledby="paid-models">
          <h2 id="paid-models" className="text-[19px] font-semibold">
            النماذج المدفوعة <span className="tnum text-[14px] font-normal text-ink-3">({paid.length})</span>
          </h2>
          <p className="mt-1 text-[13.5px] text-ink-3">
            متاحة لمشتركي Pro — الخصم من الرصيد بالدولار حسب الاستهلاك الفعلي (إدخال + إخراج).
          </p>
          <div className="mt-4 overflow-hidden rounded-2xl border border-hair shadow-1">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="bg-surface-2 text-start text-[12px] text-ink-3">
                  <th className="px-4 py-3 text-start font-medium">النموذج</th>
                  <th className="px-4 py-3 text-start font-medium">الإدخال / 1M</th>
                  <th className="px-4 py-3 text-start font-medium">الإخراج / 1M</th>
                  <th className="px-4 py-3 text-start font-medium">السياق</th>
                </tr>
              </thead>
              <tbody>
                {paid.map((m) => (
                  <tr key={m.id} className="border-t border-hair bg-surface">
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-ink">{m.name}</span>
                        {m.is_default && (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent">افتراضي</span>
                        )}
                      </span>
                      {m.description && <span className="mt-0.5 block text-[12px] leading-6 text-ink-3">{m.description}</span>}
                    </td>
                    <td className="tnum px-4 py-3 text-ink-2" dir="ltr">${fmtPrice(m.price_in_usd)}</td>
                    <td className="tnum px-4 py-3 text-ink-2" dir="ltr">${fmtPrice(m.price_out_usd)}</td>
                    <td className="tnum px-4 py-3 text-ink-3" dir="ltr">{typeof m.context_note === "string" ? m.context_note : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!dbError && rows.length === 0 && (
        <p className="mt-6 rounded-2xl border border-hair bg-surface-2 px-5 py-4 text-[14px] leading-7 text-ink-2">
          لسه مفيش نماذج منشورة — راجع الصفحة قريب.
        </p>
      )}

      {/* ——— دليل ربط الـAPI ——— */}
      <section className="mt-14" aria-labelledby="api-guide">
        <h2 id="api-guide" className="text-[19px] font-semibold">استخدم النماذج دي بـAPI</h2>
        <p className="mt-2 text-[14.5px] leading-8 text-ink-2">
          واجهة MALG متوافقة مع OpenAI — أي مكتبة أو أداة بتدعم OpenAI بتشتغل معانا بتغيير الرابط والمفتاح بس.
          اعمل مفتاحك من{" "}
          <a href="/#/api" className="font-medium text-accent hover:underline">
            صفحة مفاتيح الـAPI
          </a>{" "}
          (مفتاح واحد بيشتغل مع كل النماذج)، وحدّد النموذج في الطلب بـ<span dir="ltr" className="font-mono text-[13px]">model</span>.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">١ — Base URL</p>
            <pre className="overflow-x-auto rounded-xl border border-hair bg-surface-2 p-4 text-left font-mono text-[12.5px] leading-6 text-ink" dir="ltr">
              <code>{`https://<your-domain>/api/malg/v1`}</code>
            </pre>
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">٢ — مثال cURL</p>
            <pre className="overflow-x-auto rounded-xl border border-hair bg-surface-2 p-4 text-left font-mono text-[12.5px] leading-6 text-ink" dir="ltr">
              <code>{`curl https://<your-domain>/api/malg/v1/chat/completions \\
  -H "Authorization: Bearer $MALG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${rows[0]?.id || "malg-ai"}",
    "messages": [{ "role": "user", "content": "Hello" }]
  }'`}</code>
            </pre>
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">٣ — Python (مكتبة OpenAI الرسمية)</p>
            <pre className="overflow-x-auto rounded-xl border border-hair bg-surface-2 p-4 text-left font-mono text-[12.5px] leading-6 text-ink" dir="ltr">
              <code>{`from openai import OpenAI

client = OpenAI(
    base_url="https://<your-domain>/api/malg/v1",
    api_key="MALG_API_KEY",
)

res = client.chat.completions.create(
    model="${rows[0]?.id || "malg-ai"}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(res.choices[0].message.content)`}</code>
            </pre>
          </div>

          <div>
            <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">٤ — اكتشاف النماذج المتاحة برمجيًا</p>
            <pre className="overflow-x-auto rounded-xl border border-hair bg-surface-2 p-4 text-left font-mono text-[12.5px] leading-6 text-ink" dir="ltr">
              <code>{`GET /api/malg/v1/models
→ { "object": "list", "data": [ { "id": "...", "tier": "free|paid", ... } ] }`}</code>
            </pre>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-hair bg-surface-2 p-5 text-[13.5px] leading-7 text-ink-2">
          <p className="font-medium text-ink">إزاي بيحسب الخصم؟</p>
          <p className="mt-1.5">
            الخصم = (وحدات الإدخال × سعر الإدخال + وحدات الإخراج × سعر الإخراج) ÷ مليون — بالدولار من رصيدك.
            النموذج اللي سعره 0/0 مجاني بالكامل ومش بيخصم أي حاجة. تابع رصيدك واستهلاكك من{" "}
            <a href="/#/api" className="font-medium text-accent hover:underline">
              صفحة مفاتيح الـAPI
            </a>
            .
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href="/#/api"
            className="inline-flex h-11 items-center justify-center rounded-full bg-accent px-6 text-[14.5px] font-medium text-accent-ink transition-colors duration-1 hover:bg-accent-hover"
          >
            اعمل مفتاح API الآن
          </a>
          <a
            href="/pricing"
            className="inline-flex h-11 items-center justify-center rounded-full border border-hair-2 px-6 text-[14.5px] font-medium text-ink transition-colors duration-1 hover:bg-surface-2"
          >
            باقات الرصيد والشحن
          </a>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-hair bg-surface-2 p-5 text-[14px] leading-8 text-ink-2">
        ملحوظة: الأسعار بالدولار لكل مليون وحدة (توكن). النماذج المجانية ممكن تكون عليها طابور في أوقات
        الضغط — النماذج المدفوعة ليها أولوية أعلى. وباقات الشحن متاحة من{" "}
        <a href="/pricing" className="font-medium text-accent hover:underline">
          صفحة الباقات
        </a>
        .
      </section>
    </div>
  );
}
