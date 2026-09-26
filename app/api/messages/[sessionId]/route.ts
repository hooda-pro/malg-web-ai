import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { ChatMessage } from "@/lib/types";

function mapMessage(row: any): ChatMessage {
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
  };
}

export async function GET(_req: NextRequest, { params }: { params: { sessionId: string } }) {
  const user = getSessionUser();
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
  return NextResponse.json({ messages: rows.map(mapMessage) });
}
