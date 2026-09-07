import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { sql, ensureSchema } from "@/lib/db";
import { COOKIE_NAME, SESSION_COOKIE_MAX_AGE, signSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    if (!email || password.length < 6) {
      return NextResponse.json(
        { error: "يرجى إدخال بريد إلكتروني صحيح وكلمة مرور من 6 أحرف على الأقل" },
        { status: 400 }
      );
    }

    await ensureSchema();

    const rows = await sql`
      SELECT id, email, password_hash, display_name, is_admin, is_banned, age, profile_complete
      FROM users WHERE email = ${email}
    `;
    const row = rows[0] as
      | {
          id: string;
          email: string;
          password_hash: string | null;
          display_name: string;
          is_admin: boolean;
          is_banned: boolean;
          age: number | null;
          profile_complete: boolean;
        }
      | undefined;

    if (!row || !row.password_hash) {
      return NextResponse.json(
        { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 }
      );
    }

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
      return NextResponse.json(
        { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" },
        { status: 401 }
      );
    }

    if (row.is_banned) {
      return NextResponse.json(
        { error: "تم حظر هذا الحساب من إدارة المنصة — مش قادر تسجل دخول بيه. تواصل مع الدعم لو عندك استفسار." },
        { status: 403 }
      );
    }

    const user = {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      profileComplete: row.profile_complete,
      age: row.age,
    };
    const token = signSession(user);

    const res = NextResponse.json({ user });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE,
    });
    return res;
  } catch (e) {
    console.error("login error", e);
    return NextResponse.json({ error: "تعذر تسجيل الدخول، حاول تاني" }, { status: 500 });
  }
}
