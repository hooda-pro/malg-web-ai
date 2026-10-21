import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { expireDueDeletions } from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";

/** قايمة طلبات حذف الحسابات المعلقة — المستخدم يطلب، والأدمن يقرر (رفض أو حذف فوري) */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  // الأول: نفّذ طلبات ملّوت مهلتهم (30 يوم من غير دخول) — عشان القايمة تفضل سليمة
  await expireDueDeletions();

  const rows = (await sql`
    SELECT u.id, u.email, u.display_name, u.deletion_reason, u.deletion_requested_at, u.created_at,
           (SELECT COUNT(*)::int FROM chat_sessions s WHERE s.user_id = u.id) AS sessions_count,
           (SELECT COUNT(*)::int FROM chat_messages m
              JOIN chat_sessions s2 ON s2.id = m.session_id
             WHERE s2.user_id = u.id) AS messages_count,
           q.used_tokens
    FROM users u
    LEFT JOIN user_quota q ON q.user_id = u.id
    WHERE u.deletion_requested_at IS NOT NULL
    ORDER BY u.deletion_requested_at ASC
    LIMIT 200
  `) as {
    id: string;
    email: string;
    display_name: string;
    deletion_reason: string | null;
    deletion_requested_at: string;
    created_at: string;
    sessions_count: number;
    messages_count: number;
    used_tokens: unknown;
  }[];

  return NextResponse.json({
    deletions: rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      reason: r.deletion_reason,
      requestedAt: r.deletion_requested_at,
      createdAt: r.created_at,
      sessionsCount: Number(r.sessions_count ?? 0),
      messagesCount: Number(r.messages_count ?? 0),
      usedTokens: Number(r.used_tokens ?? 0),
    })),
  });
}
