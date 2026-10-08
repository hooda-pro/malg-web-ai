import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { validateProviderInput } from "@/lib/provider";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * اختبار اتصال المزوّد قبل الحفظ — بيبعت طلب chat حقيقي مصغر
 * (max_tokens صغير) بأول مفتاح ويقولك شغال ولا لأ وسبب الفشل.
 * المفاتيح عمرها ما بتتخزن هنا — بتتجرب وتترمي.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const checked = validateProviderInput(body ?? {});
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const v = checked.value;
  const key = v.apiKeys[0];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(v.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: v.model,
        messages: [{ role: "user", content: "رد بكلمة واحدة: تمام" }],
        temperature: v.temperature,
        max_tokens: 10,
        stream: false,
      }),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (res.ok) {
      let sample = "";
      try {
        const json = JSON.parse(text);
        sample = String(json?.choices?.[0]?.message?.content ?? "").slice(0, 200);
      } catch {
        sample = "";
      }
      return NextResponse.json({ ok: true, sample });
    }
    let hint = "";
    if (res.status === 401 || res.status === 403) hint = "المفتاح مرفوض — راجع الـ API Key";
    else if (res.status === 402) hint = "رصيد المزوّد خلصان (payment/quota)";
    else if (res.status === 404) hint = "اسم الموديل مش موجود عند المزوّد ده — راجع اسم الموديل بالظبط";
    else if (res.status === 429) hint = "المزوّد مضغوط حاليًا (rate limit) — الإعداد شكله صح، جرّب تاني";
    return NextResponse.json(
      { ok: false, error: `المزوّد رد بخطأ ${res.status}${hint ? ` — ${hint}` : ""}`, detail: text.slice(0, 500) },
      { status: 502 }
    );
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      { ok: false, error: aborted ? "المهلة خلصت — الرابط مش بيرد، راجع الـ Base URL" : "مش قادر أوصل للرابط — راجع الـ Base URL والإنترنت" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
