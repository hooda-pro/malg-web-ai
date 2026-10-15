import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getMemory } from "@/lib/memory";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  await ensureSchema();
  const rows = (await sql`SELECT memory_enabled FROM users WHERE id = ${user.id}`) as {
    memory_enabled: boolean | null;
  }[];
  const enabled = rows[0]?.memory_enabled !== false;
  const summary = await getMemory(user.id).catch(() => null);
  return NextResponse.json({ summary, enabled });
}

export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "بيانات ناقصة" }, { status: 400 });
  }
  await ensureSchema();
  await sql`UPDATE users SET memory_enabled = ${body.enabled} WHERE id = ${user.id}`;
  return NextResponse.json({ ok: true, enabled: body.enabled });
}

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  await ensureSchema();
  await sql`DELETE FROM user_memory WHERE user_id = ${user.id}`;
  return NextResponse.json({ ok: true, summary: null });
}
