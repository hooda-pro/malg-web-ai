import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  const body = await req.json().catch(() => ({}));
  const title = String(body?.title || "").trim();
  if (!title) return NextResponse.json({ error: "العنوان فارغ" }, { status: 400 });

  await sql`
    UPDATE chat_sessions SET title = ${title}, updated_at = now()
    WHERE id = ${params.id} AND user_id = ${user.id}
  `;
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  await sql`DELETE FROM chat_sessions WHERE id = ${params.id} AND user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
