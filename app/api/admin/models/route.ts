import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import {
  invalidateProviderCache,
  listModels,
  validateModelInput,
  CAPABILITIES_ALLOWED,
  AUDIO_FORMATS_ALLOWED,
} from "@/lib/provider";

export const dynamic = "force-dynamic";

/** بيجمد CSV وسوم معتمدة بس — من مصفوفة أو نص مسافراتي؛ الغريب بيتناسى. */
function parseAllowedCsv(raw: unknown, allowed: readonly string[]): string {
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [];
  return [
    ...new Set(
      items
        .map((t) => String(t).trim().toLowerCase())
        .filter((t) => t && allowed.includes(t))
    ),
  ].join(",");
}

/** كل الموديلات للأدمن (نشطة وغير نشطة) — بدون مفاتيح خام */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  return NextResponse.json({ models: await listModels(false) });
}

/** إنشاء موديل جديد — بإعداد مزوّد مبدئي يعدّله الأدمن من نموذج المزوّد */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = (await req.json().catch(() => ({}))) as {
    id?: unknown;
    name?: unknown;
    description?: unknown;
    modality?: unknown;
    price_in_usd?: unknown;
    price_out_usd?: unknown;
    profit_usd?: unknown;
    context_note?: unknown;
  };
  const checked = validateModelInput(body ?? {});
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const v = checked.value;

  const existing = (await sql`SELECT id FROM ai_models WHERE id = ${v.id} LIMIT 1`) as { id: string }[];
  if (existing.length > 0) {
    return NextResponse.json({ error: "يوجد موديل بنفس المعرف بالفعل — اختر id مختلفًا" }, { status: 400 });
  }

  const countRows = (await sql`SELECT COUNT(*)::int AS c FROM ai_models`) as { c: number }[];
  const isFirst = Number(countRows[0]?.c ?? 0) === 0;
  // الموديل الجديد ينزل في آخر الترتيب (مش الأول) — عشان الترتيب اليدوي يفضل ثابت
  const maxRows = (await sql`SELECT COALESCE(MAX(sort_order), -1)::int AS m FROM ai_models`) as { m: number }[];
  const nextOrder = Number(maxRows[0]?.m ?? -1) + 1;
  // قيم مبدئية آمنة — الأدمن يعدل الرابط/المفاتيح من نموذج المزوّد قبل الاعتماد عليه.
  // stt = موديل إدخال صوتي («أذن المنصة» — بترجم التسجيلات لكل الموديلات، مخفي من الـAPI).
  const rawModality = (body as { modality?: unknown }).modality;
  const modality = rawModality === "tts" || rawModality === "stt" ? rawModality : "chat";
  // القدرات والصيغ (وسوم CSV مسموحة بس) — النموذج الصوتي بيتولد بالقدرات اللي
  // الأدمن اختارها، وبتتحرر لاحقًا من واجهة «النماذج الصوتية».
  const capabilitiesCsv = parseAllowedCsv((body as { capabilities?: unknown }).capabilities, CAPABILITIES_ALLOWED);
  const audioFormatsCsv = parseAllowedCsv((body as { audio_formats?: unknown }).audio_formats, AUDIO_FORMATS_ALLOWED);
  // لو الأدمن مبعتش قدرات — النموذج بيتولد بقدرته الأساسية (stt أو tts) صريحة
  const capabilitiesFinal =
    capabilitiesCsv || (modality === "stt" ? "stt" : modality === "tts" ? "tts" : "");
  // تسعير مبدئي اختياري بالدولار لكل مليون وحدة (تحديث ١٩) — يتعدل لاحقًا من شريحة الأدمن
  const priceUsdToMicro = (raw: unknown): number => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 1_000_000), 1_000_000_000) : 0;
  };
  const priceInMicro = priceUsdToMicro((body as { price_in_usd?: unknown }).price_in_usd);
  const priceOutMicro = priceUsdToMicro((body as { price_out_usd?: unknown }).price_out_usd);
  const profitMicro = priceUsdToMicro((body as { profit_usd?: unknown }).profit_usd);
  const contextNoteRaw = (body as { context_note?: unknown }).context_note;
  const contextNote = typeof contextNoteRaw === "string" ? contextNoteRaw.trim().slice(0, 40) : "";
  await sql`
    INSERT INTO ai_models (id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default, sort_order, modality, capabilities, audio_formats, price_in_usd, price_out_usd, profit_usd, context_note)
    VALUES (${v.id}, ${v.name}, ${v.description}, 'https://api.openai.com/v1', 'chat_completions', ${v.id}, '{}', 0.4, 128000, TRUE, ${isFirst}, ${nextOrder}, ${modality}, ${capabilitiesFinal}, ${audioFormatsCsv}, ${priceInMicro}, ${priceOutMicro}, ${profitMicro}, ${contextNote})
  `;
  invalidateProviderCache();

  await logAdminAction(guard.admin, "create_model", null, null, `إنشاء موديل جديد: ${v.name} (${v.id})`);

  return NextResponse.json({ ok: true, createdId: v.id, models: await listModels(false) });
}
