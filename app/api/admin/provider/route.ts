import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import {
  getActiveProvider,
  getSavedProvider,
  invalidateProviderCache,
  toPublicConfig,
  validateProviderInput,
} from "@/lib/provider";

export const dynamic = "force-dynamic";

/** الإعداد الحالي للمزوّد — المفاتيح راجعة متخفية بس */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const saved = await getSavedProvider();
  const active = await getActiveProvider();
  return NextResponse.json({
    provider: saved ? toPublicConfig(saved) : null,
    active: toPublicConfig(active),
    fromEnv: saved === null,
  });
}

/** حفظ إعداد مزود جديد — بيحل محل القديم وبيتفعل فورًا */
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

  await sql`UPDATE provider_settings SET is_active = FALSE WHERE is_active = TRUE`;
  const id = randomUUID();
  await sql`
    INSERT INTO provider_settings (id, name, base_url, model, api_keys, temperature, max_tokens, is_active)
    VALUES (${id}, ${v.name}, ${v.baseUrl}, ${v.model}, ${v.apiKeys}, ${v.temperature}, ${v.maxTokens}, TRUE)
  `;
  invalidateProviderCache();

  const active = await getActiveProvider();
  await logAdminAction(
    guard.admin,
    "update_provider",
    null,
    null,
    `تغيير المزوّد: ${v.name} — ${v.model} (${v.apiKeys.length} مفتاح)`
  );

  return NextResponse.json({ ok: true, active: toPublicConfig(active) });
}
