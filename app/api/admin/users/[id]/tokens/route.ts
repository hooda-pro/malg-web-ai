import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { ensureUserCredits } from "@/lib/quota";
import { formatBalance } from "@/lib/ai";

export const dynamic = "force-dynamic";

/**
 * إدارة رصيد مستخدم (تحديث ١٩ — الرصيد بالدولار):
 * - add   : شحن مبلغ إضافي فوق الرصيد الحالي
 * - set   : تعيين الرصيد الكلي لقيمة محددة
 * - reset : تصفير الاستهلاك (المستخدم يرجع رصيده كامل من غير تغيير التخصيص)
 * المبلغ القادم من الواجهة بالدولار (يقبل عشري، مثل 2.5) — يتخزن بالـmicro-dollar.
 */
export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = await req.json().catch(() => ({}));
  const mode = String(body?.mode || "");
  const amountUsd = Number(body?.amount ?? 0);
  const amountMicro = Math.round(amountUsd * 1_000_000);

  if (!["add", "set", "reset"].includes(mode)) {
    return NextResponse.json({ error: "نوع العملية غير معروف" }, { status: 400 });
  }
  if (mode !== "reset" && (!Number.isFinite(amountUsd) || amountUsd < 0)) {
    return NextResponse.json({ error: "أدخل مبلغ بالدولار صحيح (0 أو أكثر، يقبل عشري)" }, { status: 400 });
  }
  if (mode === "add" && amountMicro <= 0) {
    return NextResponse.json({ error: "مبلغ الشحن لازم يكون أكبر من صفر" }, { status: 400 });
  }

  const targetRows = (await sql`
    SELECT id, email, display_name FROM users WHERE id = ${params.id}
  `) as { id: string; email: string; display_name: string }[];
  const target = targetRows[0];
  if (!target) {
    return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
  }

  await ensureUserCredits(target.id);

  if (mode === "add") {
    await sql`
      UPDATE user_credits
      SET total_micro = total_micro + ${amountMicro},
          exhausted_at = NULL,
          updated_at = now()
      WHERE user_id = ${target.id}
    `;
  } else if (mode === "set") {
    await sql`
      UPDATE user_credits
      SET total_micro = ${amountMicro},
          exhausted_at = NULL,
          updated_at = now()
      WHERE user_id = ${target.id}
    `;
  } else {
    await sql`
      UPDATE user_credits
      SET used_micro = 0,
          exhausted_at = NULL,
          updated_at = now()
      WHERE user_id = ${target.id}
    `;
  }

  const quotaRows = (await sql`
    SELECT total_micro, used_micro, exhausted_at
    FROM user_credits WHERE user_id = ${target.id}
  `)[0] as {
    total_micro: unknown;
    used_micro: unknown;
    exhausted_at: string | null;
  };

  const action =
    mode === "add" ? "recharge_balance" : mode === "set" ? "set_balance" : "reset_usage";
  const details =
    mode === "add"
      ? `شحن ${formatBalance(amountMicro)} لـ ${target.display_name}`
      : mode === "set"
        ? `تعيين رصيد ${target.display_name} إلى ${formatBalance(amountMicro)}`
        : `تصفير استهلاك ${target.display_name}`;

  await logAdminAction(guard.admin, action, target.id, target.email, details);

  return NextResponse.json({
    ok: true,
    quota: {
      totalMicro: Number(quotaRows?.total_micro ?? 0),
      usedMicro: Number(quotaRows?.used_micro ?? 0),
      exhaustedAt: quotaRows?.exhausted_at ?? null,
    },
  });
}
