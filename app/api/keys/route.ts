import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/apiKeys";

export const dynamic = "force-dynamic";

/** قائمة مفاتيح الـ API للمستخدم الحالي (المفتاح الأصلي مش بيتعرض أبداً). */
export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "لازم تسجل دخول الأول" }, { status: 401 });

  await ensureSchema();
  const keys = await listApiKeys(user.id);
  return NextResponse.json({ keys });
}

/** ينشئ مفتاح جديد — المفتاح原文 بيرجع مرة واحدة في الرد وخلاص. */
export async function POST(req: NextRequest) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "لازم تسجل دخول الأول" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = (body?.name || "").trim().slice(0, 60) || "مفتاح بدون اسم";

  await ensureSchema();

  // حد بسيط: 10 مفاتيح لكل حساب
  const existing = await listApiKeys(user.id);
  if (existing.length >= 10) {
    return NextResponse.json(
      { error: "وصلت للحد الأقصى (10 مفاتيح) — ملغي مفتاح قديم الأول" },
      { status: 400 }
    );
  }

  const { record, plainKey } = await createApiKey(user.id, name);
  return NextResponse.json({ key: record, plainKey }, { status: 201 });
}

/** ملغي مفتاح بالـ id. */
export async function DELETE(req: NextRequest) {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "لازم تسجل دخول الأول" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = (searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "id المفتاح مطلوب" }, { status: 400 });

  await ensureSchema();
  const ok = await revokeApiKey(user.id, id);
  if (!ok) {
    return NextResponse.json({ error: "المفتاح مش موجود أو ملغى أصلاً" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}