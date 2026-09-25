import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";

/** سجل إجراءات الأدمن — الأحدث أولاً. */
export async function GET(req: NextRequest) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 100) || 100, 300);

  const rows = await sql`
    SELECT id, admin_id, admin_email, action, target_user_id, target_email, details, created_at
    FROM admin_logs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;

  const logs = rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: String(row.id),
      adminId: String(row.admin_id),
      adminEmail: String(row.admin_email),
      action: String(row.action),
      targetUserId: row.target_user_id ? String(row.target_user_id) : null,
      targetEmail: row.target_email ? String(row.target_email) : null,
      details: row.details ? String(row.details) : null,
      createdAt: new Date(String(row.created_at)).toISOString(),
    };
  });

  return NextResponse.json({ logs });
}