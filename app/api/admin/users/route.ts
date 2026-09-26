import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  const like = `%${q}%`;

  const rows = (await sql`
    SELECT u.id, u.email, u.display_name, u.is_admin, u.is_banned, u.banned_at, u.created_at,
           q.total_allocated_tokens, q.used_tokens, q.quota_exhausted_at,
           (SELECT COUNT(*)::int FROM chat_sessions s WHERE s.user_id = u.id) AS sessions_count,
           (SELECT COUNT(*)::int FROM chat_messages m
              JOIN chat_sessions s2 ON s2.id = m.session_id
             WHERE s2.user_id = u.id) AS messages_count
    FROM users u
    LEFT JOIN user_quota q ON q.user_id = u.id
    WHERE u.email ILIKE ${like} OR u.display_name ILIKE ${like}
    ORDER BY u.created_at DESC
    LIMIT 300
  `) as {
    id: string;
    email: string;
    display_name: string;
    is_admin: boolean;
    is_banned: boolean;
    banned_at: string | null;
    created_at: string;
    total_allocated_tokens: unknown;
    used_tokens: unknown;
    quota_exhausted_at: string | null;
    sessions_count: number;
    messages_count: number;
  }[];

  return NextResponse.json({
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      isAdmin: r.is_admin,
      isBanned: r.is_banned,
      bannedAt: r.banned_at,
      createdAt: r.created_at,
      totalAllocatedTokens: Number(r.total_allocated_tokens ?? 0),
      usedTokens: Number(r.used_tokens ?? 0),
      quotaExhaustedAt: r.quota_exhausted_at,
      sessionsCount: Number(r.sessions_count ?? 0),
      messagesCount: Number(r.messages_count ?? 0),
    })),
  });
}