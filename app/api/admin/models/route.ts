import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { invalidateProviderCache, listModels, validateModelInput } from "@/lib/provider";

export const dynamic = "force-dynamic";

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

  const body = (await req.json().catch(() => ({}))) as { id?: unknown; name?: unknown; description?: unknown; modality?: unknown };
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
  // قيم مبدئية آمنة — الأدمن يعدل الرابط/المفاتيح من نموذج المزوّد قبل الاعتماد عليه
  const modality = (body as { modality?: unknown }).modality === "tts" ? "tts" : "chat";
  await sql`
    INSERT INTO ai_models (id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default, sort_order, modality)
    VALUES (${v.id}, ${v.name}, ${v.description}, 'https://api.openai.com/v1', 'chat_completions', ${v.id}, '{}', 0.4, 128000, TRUE, ${isFirst}, ${nextOrder}, ${modality})
  `;
  invalidateProviderCache();

  await logAdminAction(guard.admin, "create_model", null, null, `إنشاء موديل جديد: ${v.name} (${v.id})`);

  return NextResponse.json({ ok: true, createdId: v.id, models: await listModels(false) });
}
