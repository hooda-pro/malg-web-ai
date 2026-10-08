import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * إعادة توليد رد: بيمسح آخر رد مساعد (لو آخر حاجة في الشات) ويرجّع نص
 * رسالة المستخدم اللي قبله — الواجهة بعدها بتنادي /api/chat عادي
 * بنفس النص فيتولد رد جديد. مفيش توليد هنا نفسها عشان نعيد استخدام
 * نفس مسار الإرسال (حصص + streaming + حفظ) من غير ازدواج.
 */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ sessionId: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();

  const sessionRows = (await sql`
    SELECT id, ended_at FROM chat_sessions WHERE id = ${params.sessionId} AND user_id = ${user.id}
  `) as { id: string; ended_at: string | null }[];
  if (sessionRows.length === 0) {
    return NextResponse.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }
  if (sessionRows[0].ended_at) {
    return NextResponse.json({ error: "المحادثة دي اتقفلت — ابدأ محادثة جديدة." }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const messageId = String(body?.messageId || "");
  if (!messageId) {
    return NextResponse.json({ error: "حدد الرد" }, { status: 400 });
  }

  const rows = (await sql`
    SELECT id, role, content FROM chat_messages
    WHERE session_id = ${params.sessionId}
    ORDER BY created_at ASC
  `) as { id: string; role: string; content: string }[];

  const idx = rows.findIndex((r) => r.id === messageId);
  if (idx < 0) {
    return NextResponse.json({ error: "الرد غير موجود" }, { status: 404 });
  }
  if (rows[idx].role !== "assistant") {
    return NextResponse.json({ error: "إعادة التوليد لردود المساعد بس" }, { status: 400 });
  }
  // لازم يكون آخر رد مساعد (مفيش بعده غير يمكن رسالة مستخدم لسه متردش عليها)
  const afterAssistant = rows.slice(idx + 1);
  if (afterAssistant.some((r) => r.role === "assistant")) {
    return NextResponse.json({ error: "ينفع تعيد توليد آخر رد بس" }, { status: 400 });
  }

  // دور على آخر رسالة مستخدم قبل الرد ده — هي اللي هنعيد إرسالها
  let userMsg: { id: string; content: string } | null = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (rows[i].role === "user") {
      userMsg = { id: rows[i].id, content: rows[i].content };
      break;
    }
  }
  if (!userMsg) {
    return NextResponse.json({ error: "مفيش رسالة مستخدم قبل الرد ده" }, { status: 400 });
  }

  // امسح الرد القديم (وأي رسالة مستخدم يتيمة بعده لسه متردش عليها)
  await sql`
    DELETE FROM chat_messages
    WHERE session_id = ${params.sessionId} AND id IN (
      SELECT id FROM chat_messages
      WHERE session_id = ${params.sessionId}
      ORDER BY created_at ASC
      OFFSET ${idx}
    )
  `;
  await sql`UPDATE chat_sessions SET updated_at = now() WHERE id = ${params.sessionId}`;

  return NextResponse.json({ ok: true, message: userMsg.content });
}
