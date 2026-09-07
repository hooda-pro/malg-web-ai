import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/** تفاصيل مستخدم كاملة: البيانات + الرصيد + المحادثات + آخر الرسايل */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const userRows = (await sql`
    SELECT u.id, u.email, u.display_name, u.is_admin, u.is_banned, u.banned_at, u.created_at,
           q.total_allocated_tokens, q.used_tokens, q.quota_exhausted_at, q.updated_at AS quota_updated_at,
           aq.total_allocated_tokens AS api_total_allocated_tokens, aq.used_tokens AS api_used_tokens
    FROM users u
    LEFT JOIN user_quota q ON q.user_id = u.id
    LEFT JOIN user_api_quota aq ON aq.user_id = u.id
    WHERE u.id = ${params.id}
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
    quota_updated_at: string | null;
    api_total_allocated_tokens: unknown;
    api_used_tokens: unknown;
  }[];

  const row = userRows[0];
  if (!row) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }

  const sessions = (await sql`
    SELECT s.id, s.title, s.created_at, s.updated_at,
           (SELECT COUNT(*)::int FROM chat_messages m WHERE m.session_id = s.id) AS messages_count,
           (SELECT COALESCE(SUM(m.tokens_used), 0) FROM chat_messages m WHERE m.session_id = s.id) AS tokens_used
    FROM chat_sessions s
    WHERE s.user_id = ${params.id}
    ORDER BY s.updated_at DESC
    LIMIT 50
  `) as {
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    messages_count: number;
    tokens_used: unknown;
  }[];

  const messages = (await sql`
    SELECT m.id, m.role, m.content, m.tokens_used, m.created_at, s.title AS session_title, s.id AS session_id
    FROM chat_messages m
    JOIN chat_sessions s ON s.id = m.session_id
    WHERE s.user_id = ${params.id}
    ORDER BY m.created_at DESC
    LIMIT 20
  `) as {
    id: string;
    role: string;
    content: string;
    tokens_used: unknown;
    created_at: string;
    session_title: string;
    session_id: string;
  }[];

  const totals = (await sql`
    SELECT
      (SELECT COUNT(*)::int FROM chat_sessions s WHERE s.user_id = ${params.id}) AS sessions_count,
      (SELECT COUNT(*)::int FROM chat_messages m JOIN chat_sessions s2 ON s2.id = m.session_id WHERE s2.user_id = ${params.id}) AS messages_count
  `)[0] as { sessions_count: number; messages_count: number };

  return NextResponse.json({
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      isBanned: row.is_banned,
      bannedAt: row.banned_at,
      createdAt: row.created_at,
      totalAllocatedTokens: Number(row.total_allocated_tokens ?? 0),
      usedTokens: Number(row.used_tokens ?? 0),
      quotaExhaustedAt: row.quota_exhausted_at,
      quotaUpdatedAt: row.quota_updated_at,
      apiTotalAllocatedTokens: Number(row.api_total_allocated_tokens ?? 0),
      apiUsedTokens: Number(row.api_used_tokens ?? 0),
      sessionsCount: Number(totals?.sessions_count ?? 0),
      messagesCount: Number(totals?.messages_count ?? 0),
    },
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      messagesCount: Number(s.messages_count ?? 0),
      tokensUsed: Number(s.tokens_used ?? 0),
    })),
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      tokensUsed: Number(m.tokens_used ?? 0),
      createdAt: m.created_at,
      sessionTitle: m.session_title,
      sessionId: m.session_id,
    })),
  });
}

/** حذف حساب مستخدم نهائيًا (مع كل محادثاته ورصيده — CASCADE) */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  if (params.id === guard.admin.id) {
    return NextResponse.json({ error: "مينفعش تحذف حسابك الإداري بنفسك" }, { status: 400 });
  }

  const targetRows = (await sql`
    SELECT id, email, display_name, is_admin FROM users WHERE id = ${params.id}
  `) as { id: string; email: string; display_name: string; is_admin: boolean }[];
  const target = targetRows[0];

  if (!target) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }
  if (target.is_admin) {
    return NextResponse.json(
      { error: "مينفعش حذف حساب أدمن — الحسابات الإدارية محمية" },
      { status: 400 }
    );
  }

  // الـ CASCADE بيمسح معاه: المحادثات + الرسايل + الرصيد
  await sql`DELETE FROM users WHERE id = ${params.id}`;

  await logAdminAction(guard.admin, "delete_user", target.id, target.email, `حذف حساب: ${target.display_name}`);

  return NextResponse.json({ ok: true });
}