import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

/** سجل إجراءات الأدمن — آخر 150 إجراء */
export async function GET() {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const rows = (await sql`
    SELECT id, admin_email, action, target_user_id, target_email, details, created_at
    FROM admin_logs
    ORDER BY created_at DESC
    LIMIT 150
  `) as {
    id: string;
    admin_email: string;
    action: string;
    target_user_id: string | null;
    target_email: string | null;
    details: string | null;
    created_at: string;
  }[];

  return NextResponse.json({
    logs: rows.map((r) => ({
      id: r.id,
      adminEmail: r.admin_email,
      action: r.action,
      targetUserId: r.target_user_id,
      targetEmail: r.target_email,
      details: r.details,
      createdAt: r.created_at,
    })),
  });
}