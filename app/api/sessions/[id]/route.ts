import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  const body = await req.json().catch(() => ({}));

  // تثبيت/إلغاء تثبيت المحادثة أعلى القايمة
  if (typeof body?.pinned === "boolean") {
    try {
      await sql`UPDATE chat_sessions SET is_pinned = ${body.pinned}, updated_at = now() WHERE id = ${params.id} AND user_id = ${user.id}`;
    } catch {
      return NextResponse.json({ error: "التثبيت غير متاح حاليًا" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, pinned: body.pinned });
  }

  const title = String(body?.title || "").trim();
  if (!title) return NextResponse.json({ error: "العنوان فارغ" }, { status: 400 });

  await sql`
    UPDATE chat_sessions SET title = ${title}, updated_at = now()
    WHERE id = ${params.id} AND user_id = ${user.id}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  await sql`DELETE FROM chat_sessions WHERE id = ${params.id} AND user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
