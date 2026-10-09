import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import {
  getDefaultModelId,
  getModelProvider,
  getSavedModelProvider,
  invalidateProviderCache,
  sanitizeModelId,
  toPublicConfig,
  validateProviderInput,
  type ProviderInput,
} from "@/lib/provider";

export const dynamic = "force-dynamic";

/** إعداد مزوّد موديل معين (?modelId= — الافتراضي لو مش مبعوت) — المفاتيح راجعة متخفية بس */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const q = new URL(req.url).searchParams.get("modelId") || "";
  const modelId = sanitizeModelId(q) || (await getDefaultModelId());
  const saved = await getSavedModelProvider(modelId);
  const active = await getModelProvider(modelId);
  return NextResponse.json({
    provider: saved ? toPublicConfig(saved) : null,
    active: toPublicConfig(active),
    fromEnv: saved === null,
    model: { id: active.modelId, name: active.displayName, isDefault: active.isDefault },
  });
}

/** حفظ إعداد مزوّد موديل معين — body.modelId (أو الافتراضي) */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = (await req.json().catch(() => ({}))) as ProviderInput & { modelId?: unknown };
  const requestedId = sanitizeModelId(body.modelId ?? "") || (await getDefaultModelId());

  const savedBefore = await getSavedModelProvider(requestedId);
  if (!savedBefore) {
    return NextResponse.json(
      { error: "الموديل غير موجود — أنشئه أولًا من إدارة الموديلات" },
      { status: 404 }
    );
  }

  // لو الأدمن عدّل الإعدادات من غير ما يبعت مفاتيح (إدارة المفاتيح بقى ليها
  // كارت مستقل)، نحتفظ بالمفاتيح المحفوظة بدل ما نمسحها. أول حفظ فقط هو
  // اللي بيتطلب مفاتيح — validateProviderInput بيرفض الفاضي بنفس رسالته.
  const rawKeys = (body as { apiKeys?: unknown }).apiKeys;
  const keysProvided = Array.isArray(rawKeys)
    ? rawKeys.length > 0
    : String(rawKeys ?? "").trim().length > 0;
  const checked = validateProviderInput(
    keysProvided ? body : { ...body, apiKeys: savedBefore.apiKeys ?? [] }
  );
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const v = checked.value;

  // تحديث صف الموديل نفسه (بدل نظام الصف النشط الواحد القديم).
  // الاسم: لو الأدمن كتب اسمًا صريحًا في الفورم نعتمده (هو نفس اسم العرض)،
  // ولو سابه فاضي نحتفظ بالاسم الحالي بدل الكتابة فوقه بقيمة افتراضية.
  const rawName = String((body as { name?: unknown }).name ?? "").trim();
  const displayName = rawName ? v.name : savedBefore.displayName;
  try {
    await sql`
      UPDATE ai_models
      SET name = ${displayName}, base_url = ${v.baseUrl}, protocol = ${v.protocol},
          model = ${v.model}, api_keys = ${v.apiKeys}, temperature = ${v.temperature},
          max_tokens = ${v.maxTokens}, is_active = TRUE, updated_at = now()
      WHERE id = ${requestedId}
    `;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/relation|table|column/i.test(msg)) throw e;
    // جدول ai_models لسه متعملش (سباق نادر مع ensureSchema) — fallback للمسار القديم
    await sql`UPDATE provider_settings SET is_active = FALSE WHERE is_active = TRUE`;
    const id = randomUUID();
    await sql`
      INSERT INTO provider_settings (id, name, base_url, protocol, model, api_keys, temperature, max_tokens, is_active)
      VALUES (${id}, ${v.name}, ${v.baseUrl}, ${v.protocol}, ${v.model}, ${v.apiKeys}, ${v.temperature}, ${v.maxTokens}, TRUE)
    `;
  }
  invalidateProviderCache();

  const active = await getModelProvider(requestedId);
  await logAdminAction(
    guard.admin,
    "update_provider",
    null,
    null,
    `تغيير مزوّد الموديل ${requestedId}: ${v.name} — ${v.model} [${v.protocol}] (${v.apiKeys.length} مفتاح)`
  );

  return NextResponse.json({
    ok: true,
    active: toPublicConfig(active),
    model: { id: active.modelId, name: active.displayName, isDefault: active.isDefault },
  });
}
