import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { ensureUserQuota } from "@/lib/quota";

export const dynamic = "force-dynamic";

/**
 * إدارة رصيد توكنز مستخدم:
 * - add   : شحن مبلغ إضافي فوق الرصيد الحالي
 * - set   : تعيين الرصيد الكلي لقيمة محددة
 * - reset : تصفير الاستهلاك (المستخدم يرجع رصيده كامل من غير تغيير التخصيص)
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const mode = String(body?.mode || "");
  const amount = Math.floor(Number(body?.amount ?? 0));

  if (!["add", "set", "reset"].includes(mode)) {
    return NextResponse.json({ error: "نوع العملية غير معروف" }, { status: 400 });
  }
  if (mode !== "reset" && (!Number.isFinite(amount) || amount < 0)) {
    return NextResponse.json({ error: "أدخل رقم توكنز صحيح (0 أو أكثر)" }, { status: 400 });
  }
  if (mode === "add" && amount <= 0) {
    return NextResponse.json({ error: "كمية الشحن لازم تكون أكبر من صفر" }, { status: 400 });
  }

  const targetRows = (await sql`
    SELECT id, email, display_name FROM users WHERE id = ${params.id}
  `) as { id: string; email: string; display_name: string }[];
  const target = targetRows[0];
  if (!target) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }

  await ensureUserQuota(target.id);

  if (mode === "add") {
    await sql`
      UPDATE user_quota
      SET total_allocated_tokens = total_allocated_tokens + ${amount},
          quota_exhausted_at = NULL,
          updated_at = now()
      WHERE user_id = ${target.id}
    `;
  } else if (mode === "set") {
    await sql`
      UPDATE user_quota
      SET total_allocated_tokens = ${amount},
          quota_exhausted_at = NULL,
          updated_at = now()
      WHERE user_id = ${target.id}
    `;
  } else {
    await sql`
      UPDATE user_quota
      SET used_tokens = 0,
          quota_exhausted_at = NULL,
          updated_at = now()
      WHERE user_id = ${target.id}
    `;
  }

  const quotaRows = (await sql`
    SELECT total_allocated_tokens, used_tokens, quota_exhausted_at
    FROM user_quota WHERE user_id = ${target.id}
  `)[0] as {
    total_allocated_tokens: unknown;
    used_tokens: unknown;
    quota_exhausted_at: string | null;
  };

  const action =
    mode === "add" ? "recharge_tokens" : mode === "set" ? "set_tokens" : "reset_usage";
  const details =
    mode === "add"
      ? `شحن ${amount} توكنز لـ ${target.display_name}`
      : mode === "set"
        ? `تعيين رصيد ${target.display_name} إلى ${amount} توكنز`
        : `تصفير استهلاك ${target.display_name}`;

  await logAdminAction(guard.admin, action, target.id, target.email, details);

  return NextResponse.json({
    ok: true,
    quota: {
      totalAllocatedTokens: Number(quotaRows?.total_allocated_tokens ?? 0),
      usedTokens: Number(quotaRows?.used_tokens ?? 0),
      quotaExhaustedAt: quotaRows?.quota_exhausted_at ?? null,
    },
  });
}