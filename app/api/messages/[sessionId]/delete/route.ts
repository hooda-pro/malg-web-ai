import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * حذف رسالة واحدة (DELETE ?messageId=...) أو فرع كامل من رسالة لآخر الشات
 * (DELETE ?fromMessageId=...). أي حذف بيشمل الردود اللي بعد الرسالة المحذوفة
 * ضمنيًا لأن fromMessageId بيحذف كل اللي بعده.
 */
export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ sessionId: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();

  const sessionRows = await sql`
    SELECT id, ended_at FROM chat_sessions WHERE id = ${params.sessionId} AND user_id = ${user.id}
  `;
  if (sessionRows.length === 0) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  const messageId = req.nextUrl.searchParams.get("messageId") || "";
  const fromMessageId = req.nextUrl.searchParams.get("fromMessageId") || "";
  const targetId = messageId || fromMessageId;
  if (!targetId) {
    return NextResponse.json({ error: "حدد الرسالة" }, { status: 400 });
  }

  const targetRows = (await sql`
    SELECT id, created_at FROM chat_messages
    WHERE id = ${targetId} AND session_id = ${params.sessionId}
  `) as { id: string; created_at: string }[];
  if (targetRows.length === 0) {
    return NextResponse.json({ error: "الرسالة غير موجودة" }, { status: 404 });
  }

  if (messageId) {
    // حذف رسالة مفردة — بس آخر رسالة في الشات (أمان: مينفعش تخرم النص)
    const lastRows = (await sql`
      SELECT id FROM chat_messages
      WHERE session_id = ${params.sessionId}
      ORDER BY created_at DESC LIMIT 2
    `) as { id: string }[];
    if (lastRows[0]?.id !== messageId) {
      return NextResponse.json(
        { error: "ينفع تحذف آخر رسالة بس — أو احذف من النقطة دي لآخر الشات" },
        { status: 400 }
      );
    }
    await sql`DELETE FROM chat_messages WHERE id = ${messageId} AND session_id = ${params.sessionId}`;
  } else {
    // حذف الفرع: الرسالة دي وكل اللي بعدها
    await sql`
      DELETE FROM chat_messages
      WHERE session_id = ${params.sessionId} AND created_at >= ${targetRows[0].created_at}
    `;
  }

  await sql`UPDATE chat_sessions SET updated_at = now() WHERE id = ${params.sessionId}`;
  return NextResponse.json({ ok: true });
}
