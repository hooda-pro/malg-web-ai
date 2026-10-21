import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** اختبار مفتاح Tavily قبل الحفظ — بحث حقيقي واحد مصغر */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const raw = Array.isArray(body?.apiKeys)
    ? body.apiKeys.map((k: unknown) => String(k ?? "").trim()).filter(Boolean)
    : String(body?.apiKeys ?? "").split(/[\n,;]+/).map((k: string) => k.trim()).filter(Boolean);
  const key = [...new Set(raw)][0] as string | undefined;
  if (!key) {
    return NextResponse.json({ error: "اكتب مفتاح Tavily الأول" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query: "test", max_results: 1, include_answer: false }),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    if (res.ok) return NextResponse.json({ ok: true });
    let hint = "";
    if ([401, 403].includes(res.status)) hint = "المفتاح مرفوض — راجعه من tavily.com";
    else if (res.status === 402) hint = "رصيد البحث خلصان";
    else if (res.status === 429) hint = "ضغط مؤقت — الإعداد شكله صح، جرّب تاني";
    return NextResponse.json(
      { ok: false, error: `Tavily رد بخطأ ${res.status}${hint ? ` — ${hint}` : ""}`, detail: text.slice(0, 300) },
      { status: 502 }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "مش قادر أوصل لـ Tavily — راجع الإنترنت" }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
