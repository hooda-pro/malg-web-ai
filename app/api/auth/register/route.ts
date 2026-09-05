import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { COOKIE_NAME, SESSION_COOKIE_MAX_AGE, signSession } from "@/lib/auth";
import { REGISTERED_TOKEN_QUOTA } from "@/lib/systemPrompt";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const name = String(body?.name || "").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "صيغة البريد الإلكتروني مش صحيحة" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "يرجى إدخال بريد إلكتروني وكلمة مرور 6 خانات أو أكثر" },
        { status: 400 }
      );
    }
    if (!name) {
      return NextResponse.json(
        { error: "يرجى إدخال اسمك — النموذج محتاج يعرف اسمك عشان يناديك بيه" },
        { status: 400 }
      );
    }

    await ensureSchema();

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "البريد الإلكتروني ده متسجل بحساب قبل كده" },
        { status: 409 }
      );
    }

    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);
    const displayName = name || email.split("@")[0];

    await sql`
      INSERT INTO users (id, email, password_hash, display_name, is_admin)
      VALUES (${id}, ${email}, ${passwordHash}, ${displayName}, FALSE)
    `;
    await sql`
      INSERT INTO user_quota (user_id, total_allocated_tokens, used_tokens)
      VALUES (${id}, ${REGISTERED_TOKEN_QUOTA}, 0)
    `;

    const user = { id, email, displayName, isAdmin: false };
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
    console.error("register error", e);
    return NextResponse.json({ error: "تعذر إنشاء الحساب، حاول تاني" }, { status: 500 });
  }
}
