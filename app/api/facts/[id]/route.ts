import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { deleteFact } from "@/lib/facts";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف ناقص" }, { status: 400 });
  await ensureSchema();
  const ok = await deleteFact(user.id, id);
  if (!ok) return NextResponse.json({ error: "الحقيقة غير موجودة" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
