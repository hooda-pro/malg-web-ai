import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

/** قائمة المستخدمين مع أرصدتهم (شات + API) — بتستخدمها لوحة الأدمن. */
export async function GET(req: NextRequest) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get("q") || "").trim();
  const limit = Math.min(Number(searchParams.get("limit") || 100) || 100, 200);

  // ILIKE مع بارامترات — مفيش أي string بيتلزق جوه الـ SQL مباشرة
  const rows = search
    ? await sql`
        SELECT
          u.id, u.email, u.display_name, u.is_admin, u.created_at,
          COALESCE(q.total_allocated_tokens, 0) AS chat_total,
          COALESCE(q.used_tokens, 0) AS chat_used,
          COALESCE(aq.total_allocated_tokens, 0) AS api_total,
          COALESCE(aq.used_tokens, 0) AS api_used,
          (SELECT COUNT(*)::int FROM chat_sessions s WHERE s.user_id = u.id) AS session_count,
          (SELECT COALESCE(SUM(m.tokens_used), 0)::int FROM chat_messages m
             JOIN chat_sessions s2 ON s2.id = m.session_id
            WHERE s2.user_id = u.id) AS message_tokens
        FROM users u
        LEFT JOIN user_quota q ON q.user_id = u.id
        LEFT JOIN user_api_quota aq ON aq.user_id = u.id
        WHERE u.email ILIKE ${`%${search}%`} OR u.display_name ILIKE ${`%${search}%`}
        ORDER BY u.created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT
          u.id, u.email, u.display_name, u.is_admin, u.created_at,
          COALESCE(q.total_allocated_tokens, 0) AS chat_total,
          COALESCE(q.used_tokens, 0) AS chat_used,
          COALESCE(aq.total_allocated_tokens, 0) AS api_total,
          COALESCE(aq.used_tokens, 0) AS api_used,
          (SELECT COUNT(*)::int FROM chat_sessions s WHERE s.user_id = u.id) AS session_count,
          (SELECT COALESCE(SUM(m.tokens_used), 0)::int FROM chat_messages m
             JOIN chat_sessions s2 ON s2.id = m.session_id
            WHERE s2.user_id = u.id) AS message_tokens
        FROM users u
        LEFT JOIN user_quota q ON q.user_id = u.id
        LEFT JOIN user_api_quota aq ON aq.user_id = u.id
        ORDER BY u.created_at DESC
        LIMIT ${limit}
      `;

  const users = rows.map((r) => {
    const row = r as Record<string, unknown>;
    const chatTotal = Number(row.chat_total);
    const chatUsed = Number(row.chat_used);
    const apiTotal = Number(row.api_total);
    const apiUsed = Number(row.api_used);
    return {
      id: String(row.id),
      email: String(row.email),
      displayName: String(row.display_name),
      isAdmin: Boolean(row.is_admin),
      createdAt: new Date(String(row.created_at)).toISOString(),
      sessionCount: Number(row.session_count),
      chatQuota: { total: chatTotal, used: chatUsed, remaining: Math.max(chatTotal - chatUsed, 0) },
      apiQuota: { total: apiTotal, used: apiUsed, remaining: Math.max(apiTotal - apiUsed, 0) },
      messageTokens: Number(row.message_tokens),
    };
  });

  return NextResponse.json({ users });
}