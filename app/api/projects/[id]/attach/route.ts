import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { attachSession } from "@/lib/projects";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/attach { sessionId: string | null }
 * - sessionId نص → ربط تلك الجلسة بهذا المشروع (بعد فحص ملكية الاثنين).
 * - sessionId null → فكّ كل جلسات المستخدم المرتبطة بهذا المشروع (بعد فحص الملكية).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف ناقص" }, { status: 400 });
  const body = await req.json().catch(() => null);
  await ensureSchema();
  if (body?.sessionId === null || body?.sessionId === undefined) {
    if (body?.sessionId !== null) {
      return NextResponse.json({ error: "sessionId مطلوب (أو null للفك)" }, { status: 400 });
    }
    // فكّ الارتباط: تحقق أولًا إن المشروع ملك المستخدم
    const prows = (await sql`SELECT id FROM projects WHERE id = ${id} AND user_id = ${user.id}`) as any[];
    if (prows.length === 0) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
    await sql`UPDATE chat_sessions SET project_id = NULL WHERE project_id = ${id} AND user_id = ${user.id}`;
    return NextResponse.json({ ok: true });
  }
  if (typeof body.sessionId !== "string" || !body.sessionId) {
    return NextResponse.json({ error: "sessionId مطلوب (أو null للفك)" }, { status: 400 });
  }
  const r = await attachSession(user.id, body.sessionId, id);
  if (!r.ok && r.reason === "session") {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }
  if (!r.ok) {
    return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
