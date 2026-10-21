import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { ChatMessage } from "@/lib/types";

function mapMessage(row: any, feedbackById?: Record<string, 1 | -1>): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role,
    content: row.content,
    reasoning: row.reasoning,
    thinkingDurationMs: row.thinking_duration_ms !== null ? Number(row.thinking_duration_ms) : null,
    isTruncated: row.is_truncated,
    tokensUsed: row.tokens_used,
    createdAt: row.created_at,
    feedback: (feedbackById?.[row.id] ?? null) as 1 | -1 | null,
  };
}

export async function GET(_req: NextRequest, { params: paramsPromise }: { params: Promise<{ sessionId: string }> }) {
  const params = await paramsPromise;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ messages: [] });

  await ensureSchema();

  const sessionRows = await sql`
    SELECT id FROM chat_sessions WHERE id = ${params.sessionId} AND user_id = ${user.id}
  `;
  if (sessionRows.length === 0) {
    return NextResponse.json({ messages: [] });
  }

  const rows = await sql`
    SELECT id, session_id, role, content, reasoning, thinking_duration_ms, is_truncated, tokens_used, created_at
    FROM chat_messages WHERE session_id = ${params.sessionId} ORDER BY created_at ASC
  `;
  // تقييمات المستخدم (👍👎) — تُدمج مع الرسايل، وغياب الجدول قبل migration = بلا تقييم
  let feedbackById: Record<string, 1 | -1> = {};
  try {
    const fb = (await sql`
      SELECT message_id, rating FROM message_feedback WHERE session_id = ${params.sessionId} AND user_id = ${user.id}
    `) as { message_id: string; rating: number }[];
    for (const r of fb) {
      if (r.rating === 1 || r.rating === -1) feedbackById[r.message_id] = r.rating;
    }
  } catch {
    // تجاهل
  }
  return NextResponse.json({ messages: rows.map((row: any) => mapMessage(row, feedbackById)) });
}
