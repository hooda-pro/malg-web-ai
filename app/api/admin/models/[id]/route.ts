import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { invalidateProviderCache, listModels, sanitizeModelId } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** تعديل بيانات الموديل (اسم/وصف/افتراضي/نشط) — إعدادات المزوّد تُعدل من /api/admin/provider */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  const id = sanitizeModelId((await params)?.id);
  if (!id) return NextResponse.json({ error: "معرف الموديل غير صالح" }, { status: 400 });

  const rows = (await sql`SELECT id, is_default FROM ai_models WHERE id = ${id} LIMIT 1`) as {
    id: string;
    is_default: boolean;
  }[];
  if (rows.length === 0) return NextResponse.json({ error: "الموديل غير موجود" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    description?: unknown;
    is_default?: unknown;
    is_active?: unknown;
  };

  const sets: string[] = [];
  if (typeof body.name === "string" && body.name.trim()) {
    const name = body.name.trim().slice(0, 60);
    sets.push("الاسم");
    await sql`UPDATE ai_models SET name = ${name}, updated_at = now() WHERE id = ${id}`;
  }
  if (typeof body.description === "string") {
    const description = body.description.trim().slice(0, 500);
    sets.push("الوصف");
    await sql`UPDATE ai_models SET description = ${description}, updated_at = now() WHERE id = ${id}`;
  }
  if (body.is_active === true || body.is_active === false) {
    if (rows[0].is_default && body.is_active === false) {
      return NextResponse.json({ error: "لا يمكن تعطيل الموديل الافتراضي — عيّن افتراضيًا آخر أولًا" }, { status: 400 });
    }
    sets.push(body.is_active ? "تفعيل" : "تعطيل");
    await sql`UPDATE ai_models SET is_active = ${body.is_active}, updated_at = now() WHERE id = ${id}`;
  }
  if (body.is_default === true) {
    await sql`UPDATE ai_models SET is_default = FALSE WHERE is_default = TRUE`;
    await sql`UPDATE ai_models SET is_default = TRUE, is_active = TRUE, updated_at = now() WHERE id = ${id}`;
    sets.push("افتراضي");
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: "لا يوجد ما يُحدّث" }, { status: 400 });
  }

  invalidateProviderCache();
  await logAdminAction(guard.admin, "update_model", null, null, `تعديل الموديل ${id}: ${sets.join("، ")}`);

  return NextResponse.json({ ok: true, models: await listModels(false) });
}

/** حذف موديل — ممنوع حذف الافتراضي أو آخر موديل متبقٍ */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  const id = sanitizeModelId((await params)?.id);
  if (!id) return NextResponse.json({ error: "معرف الموديل غير صالح" }, { status: 400 });

  const rows = (await sql`SELECT id, name, is_default FROM ai_models WHERE id = ${id} LIMIT 1`) as {
    id: string;
    name: string;
    is_default: boolean;
  }[];
  if (rows.length === 0) return NextResponse.json({ error: "الموديل غير موجود" }, { status: 404 });
  if (rows[0].is_default) {
    return NextResponse.json({ error: "لا يمكن حذف الموديل الافتراضي — عيّن افتراضيًا آخر أولًا" }, { status: 400 });
  }
  const countRows = (await sql`SELECT COUNT(*)::int AS c FROM ai_models`) as { c: number }[];
  if (Number(countRows[0]?.c ?? 0) <= 1) {
    return NextResponse.json({ error: "لا يمكن حذف آخر موديل — يجب أن يبقى موديل واحد على الأقل" }, { status: 400 });
  }

  await sql`DELETE FROM ai_models WHERE id = ${id}`;
  invalidateProviderCache();
  await logAdminAction(guard.admin, "delete_model", null, null, `حذف الموديل: ${rows[0].name} (${id})`);

  return NextResponse.json({ ok: true, models: await listModels(false) });
}
