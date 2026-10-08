import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/**
 * إعدادات البحث: مفتاح Tavily + تفعيل/تعطيل.
 * المفتاح بيتحفظ في جدول app_settings على السيرفر (مش env)،
 * والقراءة من env بتفضل fallback للإقلاع الأول.
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  const { getSearchSettings } = await import("@/lib/searchSettings");
  const s = await getSearchSettings();
  return NextResponse.json({ search: { enabled: s.enabled, hasKey: s.keysCount > 0, keysCount: s.keysCount, fromEnv: s.fromEnv } });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const enabled = body?.enabled !== false;
  const rawKeys = Array.isArray(body?.apiKeys)
    ? body.apiKeys.map((k: unknown) => String(k ?? "").trim()).filter(Boolean)
    : String(body?.apiKeys ?? "")
        .split(/[\n,;]+/)
        .map((k: string) => k.trim())
        .filter(Boolean);
  const apiKeys = [...new Set(rawKeys)].slice(0, 10) as string[];

  const { saveSearchSettings } = await import("@/lib/searchSettings");
  const saved = await saveSearchSettings({ enabled, apiKeys: apiKeys.length > 0 ? apiKeys : null });

  await logAdminAction(
    guard.admin, "update_search", null, null,
    enabled ? `تفعيل البحث (${saved.keysCount} مفتاح)` : "تعطيل البحث"
  );
  return NextResponse.json({ ok: true, search: { enabled: saved.enabled, hasKey: saved.keysCount > 0, keysCount: saved.keysCount, fromEnv: false } });
}
