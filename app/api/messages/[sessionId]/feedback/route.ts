import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * تقييم رد المساعد (👍 مفيد / 👎 غير مفيد).
 * body: { messageId, rating: 1 | -1 | 0 } — صفر أو تكرار نفس التقييم = إلغاء التقييم.
 */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ sessionId: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  const body = await req.json().catch(() => ({}));
  const messageId = String(body?.messageId || "");
  const rating = Number(body?.rating);
  if (!messageId) return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  if (![1, -1, 0].includes(rating)) return NextResponse.json({ error: "تقييم غير صالح" }, { status: 400 });

  // الرسالة لازم تكون رد مساعد في شات يملكه المستخدم
  const rows = (await sql`
    SELECT m.id FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.session_id
    WHERE m.id = ${messageId} AND m.session_id = ${params.sessionId}
      AND s.user_id = ${user.id} AND m.role = 'assistant'
  `) as { id: string }[];
  if (rows.length === 0) return NextResponse.json({ error: "الرسالة غير موجودة" }, { status: 404 });

  if (rating === 0) {
    await sql`DELETE FROM message_feedback WHERE message_id = ${messageId} AND user_id = ${user.id}`;
    return NextResponse.json({ ok: true, feedback: null });
  }
  await sql`
    INSERT INTO message_feedback (message_id, user_id, session_id, rating)
    VALUES (${messageId}, ${user.id}, ${params.sessionId}, ${rating})
    ON CONFLICT (message_id) DO UPDATE SET rating = ${rating}, created_at = now()
  `;
  return NextResponse.json({ ok: true, feedback: rating });
}
