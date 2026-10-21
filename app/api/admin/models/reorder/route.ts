import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { updateModelsOrder } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** حفظ الترتيب اليدوي للموديلات — يستقبل { order: string[] } بالترتيب الجديد */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  const body = (await req.json().catch(() => ({}))) as { order?: unknown };
  if (!Array.isArray(body.order)) {
    return NextResponse.json({ error: "الترتيب مطلوب كمصفوفة ids" }, { status: 400 });
  }
  try {
    const models = await updateModelsOrder(body.order as string[]);
    await logAdminAction(guard.admin, "reorder_models", null, null, `إعادة ترتيب الموديلات: ${(body.order as string[]).join("، ")}`);
    return NextResponse.json({ ok: true, models });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "فشل حفظ الترتيب" }, { status: 400 });
  }
}
