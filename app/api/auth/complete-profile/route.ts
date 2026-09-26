import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import {
  getSessionUser,
  signSession,
  COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE,
} from "@/lib/auth";
import { saveProfileToFirestore } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";

/**
 * بتتنفذ بعد أول تسجيل دخول بجوجل — بتحفظ الاسم والعمر اللي المستخدم كتبهم
 * وتقفل خطوة استكمال البروفايل (profile_complete = TRUE).
 */
export async function POST(req: NextRequest) {
  const user = getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const ageRaw = body?.age;
  const age = Number(ageRaw);

  if (!name) {
    return NextResponse.json(
      { error: "يرجى إدخال اسمك — النموذج هيستخدمه عشان يناديك بيه" },
      { status: 400 }
    );
  }
  if (name.length > 40) {
    return NextResponse.json({ error: "الاسم طويل جداً — 40 حرف كحد أقصى" }, { status: 400 });
  }
  if (!Number.isInteger(age) || age < 8 || age > 120) {
    return NextResponse.json({ error: "يرجى إدخال عمر صحيح (من 8 لـ 120)" }, { status: 400 });
  }

  await ensureSchema();

  await sql`
    UPDATE users
    SET display_name = ${name}, age = ${age}, profile_complete = TRUE
    WHERE id = ${user.id}
  `;

  saveProfileToFirestore(user.id, { email: user.email, name, age });

  const updatedUser = {
    id: user.id,
    email: user.email,
    displayName: name,
    isAdmin: user.isAdmin,
    profileComplete: true,
    age,
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
