import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** إنشاء/إرجاع رابط المشاركة العامة للمحادثة — التوكن يتولد مرة واحدة ويفضل ثابتًا */
export async function POST(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  const rows = (await sql`
    SELECT id, share_token FROM chat_sessions WHERE id = ${params.id} AND user_id = ${user.id}
  `) as { id: string; share_token: string | null }[];
  if (rows.length === 0) return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });

  let token = rows[0].share_token;
  if (!token) {
    token = randomUUID().replace(/-/g, "");
    await sql`UPDATE chat_sessions SET share_token = ${token} WHERE id = ${params.id} AND user_id = ${user.id}`;
  }
  return NextResponse.json({ ok: true, token });
}

/** إيقاف المشاركة العامة — الرابط القديم يموت فورًا */
export async function DELETE(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  await sql`UPDATE chat_sessions SET share_token = NULL WHERE id = ${params.id} AND user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
