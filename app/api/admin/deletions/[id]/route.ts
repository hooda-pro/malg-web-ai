import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { cancelAccountDeletion, finalizeAccountDeletion } from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";

/** قرار الأدمن على طلب حذف حساب: رفض (إلغاء الطلب) أو حذف نهائي فوري */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");

  const targetRows = (await sql`
    SELECT id, email, display_name, is_admin, deletion_requested_at
    FROM users WHERE id = ${params.id}
  `) as { id: string; email: string; display_name: string; is_admin: boolean; deletion_requested_at: string | null }[];
  const target = targetRows[0];

  if (!target || !target.deletion_requested_at) {
    return NextResponse.json({ error: "الطلب مش موجود أو تم تنفيذه قبل كده" }, { status: 404 });
  }
  if (target.is_admin) {
    return NextResponse.json(
      { error: "حسابات الإدارة محمية — مفيش طلب حذف عليها أصلاً" },
      { status: 400 }
    );
  }

  if (action === "reject") {
    // رفض = إلغاء الجدولة والحساب يرجع شغّال عادي زي ما كان
    const cancelled = await cancelAccountDeletion(target.id);
    if (!cancelled) {
      return NextResponse.json({ error: "الطلب مش موجود أو تم تنفيذه قبل كده" }, { status: 404 });
    }
    await logAdminAction(
      guard.admin,
      "cancel_account_deletion",
      target.id,
      target.email,
      `رفض طلب حذف الحساب وأرجاعه للعمل الطبيعي: ${target.display_name}`
    );
    return NextResponse.json({ ok: true, action });
  }

  if (action === "delete") {
    // حذف نهائي فوري (اختصار المهلة) مع كل البيانات — CASCADE
    await finalizeAccountDeletion(target.id);
    await logAdminAction(
      guard.admin,
      "delete_user",
      target.id,
      target.email,
      `حذف نهائي فوري (بدل مهلة الـ 30 يوم) لطلب المستخدم: ${target.display_name}`
    );
    return NextResponse.json({ ok: true, action });
  }

  return NextResponse.json({ error: "فعل مش معروف — لازم reject أو delete" }, { status: 400 });
}
