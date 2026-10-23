import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const userRows = (await sql`
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE is_banned)::int AS banned_users,
      COUNT(*) FILTER (WHERE is_admin)::int AS admin_users,
      COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')::int AS new_today,
      COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new_week
    FROM users
  `)[0] as {
    total_users: number;
    banned_users: number;
    admin_users: number;
    new_today: number;
    new_week: number;
  };

  const chatRows = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM chat_sessions) AS total_sessions,
      (SELECT COUNT(*)::int FROM chat_messages) AS total_messages,
      (SELECT COALESCE(SUM(total_micro), 0) FROM user_credits) AS total_balance_micro,
      (SELECT COALESCE(SUM(used_micro), 0) FROM user_credits) AS total_used_micro
  `)[0] as {
    total_sessions: number;
    total_messages: number;
    total_balance_micro: unknown;
    total_used_micro: unknown;
  };

  const topUsers = (await sql`
    SELECT u.id, u.display_name, u.email, c.used_micro, c.total_micro
    FROM users u
    JOIN user_credits c ON c.user_id = u.id
    ORDER BY c.used_micro DESC
    LIMIT 5
  `) as { id: string; display_name: string; email: string; used_micro: unknown; total_micro: unknown }[];

  const recentUsers = (await sql`
    SELECT id, display_name, email, created_at
    FROM users
    ORDER BY created_at DESC
    LIMIT 6
  `) as { id: string; display_name: string; email: string; created_at: string }[];

  return NextResponse.json({
    stats: {
      totalUsers: Number(userRows?.total_users ?? 0),
      bannedUsers: Number(userRows?.banned_users ?? 0),
      adminUsers: Number(userRows?.admin_users ?? 0),
      newToday: Number(userRows?.new_today ?? 0),
      newWeek: Number(userRows?.new_week ?? 0),
      totalSessions: Number(chatRows?.total_sessions ?? 0),
      totalMessages: Number(chatRows?.total_messages ?? 0),
      totalBalanceMicro: Number(chatRows?.total_balance_micro ?? 0),
      totalUsedMicro: Number(chatRows?.total_used_micro ?? 0),
      topUsers: topUsers.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        email: r.email,
        usedMicro: Number(r.used_micro ?? 0),
        totalMicro: Number(r.total_micro ?? 0),
      })),
      recentUsers: recentUsers.map((r) => ({
        id: r.id,
        displayName: r.display_name,
        email: r.email,
        createdAt: r.created_at,
      })),
    },
  });
}