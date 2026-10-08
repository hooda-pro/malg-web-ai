import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import {
  getActiveProvider,
  getSavedProvider,
  invalidateProviderCache,
  maskKey,
  toPublicConfig,
} from "@/lib/provider";

export const dynamic = "force-dynamic";

/**
 * إدارة مفاتيح المزوّد مفتاحًا بمفتاح — من غير ما تعيد كتابة كل المفاتيح:
 * - { action: "add", key } → يضيف مفتاحًا جديدًا لآخر القايمة
 * - { action: "remove", index } → يمسح مفتاحًا برقمه (ممنوع مسح آخر مفتاح)
 *
 * السيرفر أصلًا بيوزّع الحمل على المفاتيح (round-robin) وبيقلب تلقائيًا على
 * المفتاح اللي بعده لو واحد خلص أو اترفض (401/402/403/429) — فإضافة مفاتيح
 * هنا معناها استمرارية فورية من غير أي تدخل.
 * المفاتيح الخام عمرها ما بتتبعت للواجهة — الراجع masked فقط.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = (await req.json().catch(() => ({}))) as { action?: unknown; key?: unknown; index?: unknown };
  const action = String(body.action ?? "");

  const saved = await getSavedProvider();
  if (!saved) {
    return NextResponse.json({ error: "لا يوجد مزوّد محفوظ — احفظ إعداد المزوّد الأول" }, { status: 400 });
  }

  if (action === "add") {
    const key = String(body.key ?? "").trim();
    if (!key) return NextResponse.json({ error: "اكتب المفتاح الأول" }, { status: 400 });
    if (key.length < 4 || key.length > 500) {
      return NextResponse.json({ error: "شكل المفتاح غلط — راجعه" }, { status: 400 });
    }
    if (saved.apiKeys.includes(key)) {
      return NextResponse.json({ error: "المفتاح ده متسجل بالفعل" }, { status: 400 });
    }
    if (saved.apiKeys.length >= 20) {
      return NextResponse.json({ error: "وصلت للحد الأقصى (20 مفتاح) — امسح واحد قديم الأول" }, { status: 400 });
    }
    const next = [...saved.apiKeys, key];
    await sql`UPDATE provider_settings SET api_keys = ${next}, updated_at = now() WHERE id = ${saved.id}`;
    invalidateProviderCache();
    await logAdminAction(guard.admin, "update_provider", null, null, `إضافة مفتاح جديد للمزوّد: ${saved.name} (${maskKey(key)} — بقوا ${next.length})`);

    const active = await getActiveProvider();
    return NextResponse.json({ ok: true, active: toPublicConfig(active) });
  }

  if (action === "remove") {
    const idx = typeof body.index === "number" ? body.index : Number(body.index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= saved.apiKeys.length) {
      return NextResponse.json({ error: "المفتاح غير موجود — حدّث الصفحة وحاول تاني" }, { status: 400 });
    }
    if (saved.apiKeys.length <= 1) {
      return NextResponse.json({ error: "مينفعش تمسح آخر مفتاح — ضيف بديل الأول" }, { status: 400 });
    }
    const removed = saved.apiKeys[idx];
    const next = saved.apiKeys.filter((_, i) => i !== idx);
    await sql`UPDATE provider_settings SET api_keys = ${next}, updated_at = now() WHERE id = ${saved.id}`;
    invalidateProviderCache();
    await logAdminAction(guard.admin, "update_provider", null, null, `مسح مفتاح من المزوّد: ${saved.name} (${maskKey(removed)} — بقوا ${next.length})`);

    const active = await getActiveProvider();
    return NextResponse.json({ ok: true, active: toPublicConfig(active) });
  }

  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}
