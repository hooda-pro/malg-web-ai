import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import {
  getSessionUser,
  signSession,
  COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** تغيير اسم المستخدم — بيحدّث الداتابيز + كوكي الجلسة
 * (الجلسة فيها الاسم، فتحديثها ضروري عشان النموذج يعرف الاسم الجديد في الرسايل الجاية) */
export async function POST(req: NextRequest) {
  const user = getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();

  if (!name) {
    return NextResponse.json(
      { error: "يرجى إدخال اسمك — النموذج هيستخدمه عشان يناديك بيه" },
      { status: 400 }
    );
  }
  if (name.length > 40) {
    return NextResponse.json(
      { error: "الاسم طويل جداً — 40 حرف كحد أقصى" },
      { status: 400 }
    );
  }

  await ensureSchema();

  // 1) حدّث الاسم في الداتابيز
  await sql`UPDATE users SET display_name = ${name} WHERE id = ${user.id}`;

  // 2) حدّث جلسة الكوكي بالاسم الجديد
  const updatedUser = {
    id: user.id,
    email: user.email,
    displayName: name,
    isAdmin: user.isAdmin,
  };
  const token = signSession(updatedUser);

  const res = NextResponse.json({ user: updatedUser });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
  return res;
}