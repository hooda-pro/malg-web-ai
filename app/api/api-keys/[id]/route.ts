import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** إلغاء مفتاح API — تعطيل (is_active = false) من غير حذف السجل، عشان يفضل في لوج الاستخدام. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  await ensureSchema();

  const rows = (await sql`
    SELECT id FROM api_keys WHERE id = ${params.id} AND user_id = ${user.id}
  `) as { id: string }[];
  if (rows.length === 0) {
    return NextResponse.json({ error: "المفتاح غير موجود" }, { status: 404 });
  }

  await sql`UPDATE api_keys SET is_active = FALSE WHERE id = ${params.id} AND user_id = ${user.id}`;

  return NextResponse.json({ ok: true });
}
