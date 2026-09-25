import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

/** أرقام لوحة الأدمن: عدد المستخدمين، الجلسات، التوكنز المستهلكة، وآخر ٧ أيام. */
export async function GET() {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM users WHERE is_admin = TRUE) AS admins,
      (SELECT COUNT(*)::int FROM users WHERE created_at >= now() - interval '7 days') AS new_users,
      (SELECT COUNT(*)::int FROM chat_sessions) AS sessions,
      (SELECT COUNT(*)::int FROM chat_messages) AS messages,
      (SELECT COUNT(*)::int FROM api_keys WHERE is_active = TRUE) AS active_keys,
      (SELECT COALESCE(SUM(used_tokens), 0)::int FROM user_quota) AS chat_tokens_used,
      (SELECT COALESCE(SUM(total_allocated_tokens), 0)::int FROM user_quota) AS chat_tokens_allocated,
      (SELECT COALESCE(SUM(used_tokens), 0)::int FROM user_api_quota) AS api_tokens_used,
      (SELECT COALESCE(SUM(total_allocated_tokens), 0)::int FROM user_api_quota) AS api_tokens_allocated
  `;

  // استهلاك التوكنز لكل يوم في آخر ٧ أيام (الرسم البياني)
  const daily = await sql`
    SELECT
      to_char(d.day, 'YYYY-MM-DD') AS day,
      COALESCE(SUM(m.tokens_used), 0)::int AS tokens
    FROM generate_series(
      (now() - interval '6 days')::date,
      now()::date,
      interval '1 day'
    ) AS d(day)
    LEFT JOIN chat_messages m
      ON m.created_at >= d.day
     AND m.created_at < d.day + interval '1 day'
    GROUP BY d.day
    ORDER BY d.day ASC
  `;

  const c = (counts ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    stats: {
      users: Number(c.users ?? 0),
      admins: Number(c.admins ?? 0),
      newUsers: Number(c.new_users ?? 0),
      sessions: Number(c.sessions ?? 0),
      messages: Number(c.messages ?? 0),
      activeKeys: Number(c.active_keys ?? 0),
      chatTokensUsed: Number(c.chat_tokens_used ?? 0),
      chatTokensAllocated: Number(c.chat_tokens_allocated ?? 0),
      apiTokensUsed: Number(c.api_tokens_used ?? 0),
      apiTokensAllocated: Number(c.api_tokens_allocated ?? 0),
    },
    daily: daily.map((r) => {
      const row = r as Record<string, unknown>;
      return { day: String(row.day), tokens: Number(row.tokens ?? 0) };
    }),
  });
}