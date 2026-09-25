import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function POST() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });

  await ensureSchema();
  await sql`DELETE FROM chat_sessions WHERE user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
