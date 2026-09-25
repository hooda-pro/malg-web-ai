import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";

interface Body {
  chatQuotaTotal?: number;
  apiQuotaTotal?: number;
  displayName?: string;
  isAdmin?: boolean;
}

/** تعديل بيانات مستخدم: الأرصدة، الاسم، وصلاحية الأدمن. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;
  const { admin } = guard;

  const targetId = params.id;
  if (!targetId) {
    return NextResponse.json({ error: "معرّف المستخدم مطلوب" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "الطلب مش صالح" }, { status: 400 });
  }

  await ensureSchema();

  const existing = await sql`SELECT id, email, display_name, is_admin FROM users WHERE id = ${targetId}`;
  const target = existing[0] as
    | { id: string; email: string; display_name: string; is_admin: boolean }
    | undefined;
  if (!target) {
    return NextResponse.json({ error: "المستخدم مش موجود" }, { status: 404 });
  }

  // --- اسم المستخدم ---
  if (typeof body.displayName === "string" && body.displayName.trim()) {
    const name = body.displayName.trim().slice(0, 80);
    await sql`UPDATE users SET display_name = ${name} WHERE id = ${targetId}`;
    await logAdminAction(admin, "user.rename", targetId, target.email, name);
  }

  // --- رصيد الشات (المجموع المخصص، مش المتبقي) ---
  if (typeof body.chatQuotaTotal === "number" && Number.isFinite(body.chatQuotaTotal)) {
    const total = Math.max(Math.trunc(body.chatQuotaTotal), 0);
    await sql`
      INSERT INTO user_quota (user_id, total_allocated_tokens, used_tokens)
      VALUES (${targetId}, ${total}, 0)
      ON CONFLICT (user_id) DO UPDATE
        SET total_allocated_tokens = ${total}, updated_at = now()
    `;
    await logAdminAction(
      admin,
      "quota.chat.set",
      targetId,
      target.email,
      `الحد الأقصى = ${total}`
    );
  }

  // --- رصيد الـ API المنفصل ---
  if (typeof body.apiQuotaTotal === "number" && Number.isFinite(body.apiQuotaTotal)) {
    const total = Math.max(Math.trunc(body.apiQuotaTotal), 0);
    await sql`
      INSERT INTO user_api_quota (user_id, total_allocated_tokens, used_tokens)
      VALUES (${targetId}, ${total}, 0)
      ON CONFLICT (user_id) DO UPDATE
        SET total_allocated_tokens = ${total}, updated_at = now()
    `;
    await logAdminAction(
      admin,
      "quota.api.set",
      targetId,
      target.email,
      `رصيد API = ${total}`
    );
  }

  // --- صلاحية الأدمن (مع حماية من إزالة آخر أدمن عن نفسه) ---
  if (typeof body.isAdmin === "boolean") {
    if (!body.isAdmin && targetId === admin.id) {
      return NextResponse.json(
        { error: "مينفعش تشيل صلاحية الأدمن عن نفسك — عين أدمن تاني الأول" },
        { status: 400 }
      );
    }
    if (!body.isAdmin && target.is_admin) {
      const admins = await sql`SELECT COUNT(*)::int AS n FROM users WHERE is_admin = TRUE`;
      const adminCount = Number((admins[0] as { n: number } | undefined)?.n ?? 0);
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "مينفعش تشيل آخر أدمن في المنصة" },
          { status: 400 }
        );
      }
    }
    await sql`UPDATE users SET is_admin = ${body.isAdmin} WHERE id = ${targetId}`;
    await logAdminAction(
      admin,
      body.isAdmin ? "user.promote" : "user.demote",
      targetId,
      target.email,
      body.isAdmin ? "تم منح صلاحية الأدمن" : "تم سحب صلاحية الأدمن"
    );
  }

  // رجّع السطر المحدّث عشان الواجهة تتحدّث من غير reload
  const rows = await sql`
    SELECT
      u.id, u.email, u.display_name, u.is_admin, u.created_at,
      COALESCE(q.total_allocated_tokens, 0) AS chat_total,
      COALESCE(q.used_tokens, 0) AS chat_used,
      COALESCE(aq.total_allocated_tokens, 0) AS api_total,
      COALESCE(aq.used_tokens, 0) AS api_used
    FROM users u
    LEFT JOIN user_quota q ON q.user_id = u.id
    LEFT JOIN user_api_quota aq ON aq.user_id = u.id
    WHERE u.id = ${targetId}
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return NextResponse.json({ error: "المستخدم مش موجود" }, { status: 404 });

  const chatTotal = Number(r.chat_total);
  const chatUsed = Number(r.chat_used);
  const apiTotal = Number(r.api_total);
  const apiUsed = Number(r.api_used);

  return NextResponse.json({
    user: {
      id: String(r.id),
      email: String(r.email),
      displayName: String(r.display_name),
      isAdmin: Boolean(r.is_admin),
      createdAt: new Date(String(r.created_at)).toISOString(),
      chatQuota: { total: chatTotal, used: chatUsed, remaining: Math.max(chatTotal - chatUsed, 0) },
      apiQuota: { total: apiTotal, used: apiUsed, remaining: Math.max(apiTotal - apiUsed, 0) },
    },
  });
}

/** حذف مستخدم — الشات والأرصدة والمفاتيح بتتمسح معاه (ON DELETE CASCADE). */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;
  const { admin } = guard;

  const targetId = params.id;
  if (targetId === admin.id) {
    return NextResponse.json({ error: "مينفعش تحذف حسابك أنت" }, { status: 400 });
  }

  await ensureSchema();

  const existing = await sql`SELECT id, email, is_admin FROM users WHERE id = ${targetId}`;
  const target = existing[0] as { id: string; email: string; is_admin: boolean } | undefined;
  if (!target) {
    return NextResponse.json({ error: "المستخدم مش موجود" }, { status: 404 });
  }

  // لو آخر أدمن تاني — نرفض عشان مايفضلش المنصة من غير إدارة
  if (target.is_admin) {
    const admins = await sql`SELECT COUNT(*)::int AS n FROM users WHERE is_admin = TRUE`;
    if (Number((admins[0] as { n: number } | undefined)?.n ?? 0) <= 1) {
      return NextResponse.json({ error: "مينفعش تحذف آخر أدمن في المنصة" }, { status: 400 });
    }
  }

  await sql`DELETE FROM users WHERE id = ${targetId}`;
  await logAdminAction(admin, "user.delete", targetId, target.email, "تم حذف الحساب بالكامل");

  return NextResponse.json({ ok: true });
}