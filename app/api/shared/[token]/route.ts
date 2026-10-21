import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { extractAgentStepsMeta } from "@/lib/agentEvents";
import { extractAttachmentsMeta } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/**
 * عرض عام للمحادثات المشاركة برابط — بدون تسجيل دخول.
 * يرجع النص المرئي فقط: بلا تفكير داخلي، ولا توكنز، ولا بيانات حساب.
 */
export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ token: string }> }) {
  const params = await paramsPromise;
  const token = String(params.token || "").trim().slice(0, 64);
  if (!token) return NextResponse.json({ error: "رابط غير صالح" }, { status: 404 });

  await ensureSchema();
  const sessions = (await sql`
    SELECT id, title, created_at FROM chat_sessions WHERE share_token = ${token} LIMIT 1
  `) as { id: string; title: string; created_at: string }[];
  if (sessions.length === 0) {
    return NextResponse.json({ error: "المشاركة غير موجودة أو اتوقفت" }, { status: 404 });
  }
  const session = sessions[0];

  const rows = (await sql`
    SELECT role, content, created_at FROM chat_messages
    WHERE session_id = ${session.id} ORDER BY created_at ASC LIMIT 500
  `) as { role: string; content: string; created_at: string }[];

  return NextResponse.json({
    title: session.title,
    createdAt: session.created_at,
    messages: rows
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => {
        let content = String(m.content || "");
        if (m.role === "assistant") {
          content = extractAgentStepsMeta(content).visibleText;
        } else {
          try {
            content = extractAttachmentsMeta(content).visibleText;
          } catch {
            // تجاهل — اعرض الخام
          }
        }
        return { role: m.role, content, createdAt: m.created_at };
      }),
  });
}
