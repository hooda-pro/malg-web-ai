import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { ChatSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/** بحث في عناوين المحادثات ونص رسائلها — للقايمة الجانبية (العناوين لوحدها لا تكفي) */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ sessions: [] });

  await ensureSchema();
  const q = String(new URL(req.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ sessions: [] });
  const like = `%${q}%`;

  let sessions: any[];
  try {
    sessions = await sql`
      SELECT DISTINCT s.id, s.title, s.created_at, s.updated_at, s.ended_at, s.ended_reason, s.ended_by, s.is_pinned, s.share_token
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      WHERE s.user_id = ${user.id} AND COALESCE(s.is_temp, FALSE) = FALSE
        AND (s.title ILIKE ${like} OR m.content ILIKE ${like})
      ORDER BY s.is_pinned DESC, s.updated_at DESC
      LIMIT 20
    `;
  } catch {
    // قاعدة قديمة قبل migration
    sessions = await sql`
      SELECT DISTINCT s.id, s.title, s.created_at, s.updated_at, s.ended_at, s.ended_reason, s.ended_by
      FROM chat_sessions s
      LEFT JOIN chat_messages m ON m.session_id = s.id
      WHERE s.user_id = ${user.id}
        AND (s.title ILIKE ${like} OR m.content ILIKE ${like})
      ORDER BY s.updated_at DESC
      LIMIT 20
    `;
  }

  // مقتطف من أول رسالة مطابقة (للعرض تحت العنوان) — بحد أقصى معقول
  let snippets: Record<string, string> = {};
  try {
    const rows = (await sql`
      SELECT m.session_id, m.content FROM chat_messages m
      JOIN chat_sessions s ON s.id = m.session_id
      WHERE s.user_id = ${user.id} AND m.content ILIKE ${like}
      ORDER BY m.created_at ASC LIMIT 60
    `) as { session_id: string; content: string }[];
    const idx = q.toLowerCase();
    for (const r of rows) {
      if (snippets[r.session_id]) continue;
      const text = String(r.content || "").replace(/\u0000/g, " ").replace(/\uE000[ \s\S]*?\uE000/g, " ");
      const pos = text.toLowerCase().indexOf(idx);
      if (pos === -1) continue;
      const start = Math.max(0, pos - 40);
      snippets[r.session_id] = (start > 0 ? "…" : "") + text.slice(start, start + 120) + "…";
    }
  } catch {
    // تجاهل — المقتطفات تحسينية فقط
  }

  return NextResponse.json({
    sessions: sessions.map(
      (row: any): ChatSession & { snippet: string | null } => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        endedAt: row.ended_at ?? null,
        endedReason: row.ended_reason ?? null,
        endedBy: row.ended_by ?? null,
        isPinned: !!row.is_pinned,
        shareToken: row.share_token ?? null,
        snippet: snippets[row.id] ?? null,
      })
    ),
  });
}
