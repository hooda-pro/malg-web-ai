import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { COOKIE_NAME, SESSION_COOKIE_MAX_AGE, signSession } from "@/lib/auth";
import { verifyGoogleIdToken, saveProfileToFirestore } from "@/lib/firebaseAdmin";
import { REGISTERED_TOKEN_QUOTA } from "@/lib/systemPrompt";

export const dynamic = "force-dynamic";

/**
 * تسجيل الدخول / إنشاء حساب عن طريق جوجل (Firebase Auth).
 * البادي المتوقع: { idToken } — الـ ID Token اللي راجع من signInWithGoogle() في المتصفح.
 * لو الحساب جديد: بيتعمل بسجل ناقص (بدون اسم مخصص/عمر) وبيرجع needsProfile=true
 * عشان الواجهة تعرض خطوة "اكتب اسمك وعمرك".
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const idToken = String(body?.idToken || "");
    if (!idToken) {
      return NextResponse.json({ error: "توكن الدخول مفقود" }, { status: 400 });
    }

    const identity = await verifyGoogleIdToken(idToken);
    await ensureSchema();

    const rows = (await sql`
      SELECT id, email, display_name, is_admin, is_banned, age, profile_complete
      FROM users WHERE firebase_uid = ${identity.uid} OR email = ${identity.email}
    `) as
      | {
          id: string;
          email: string;
          display_name: string;
          is_admin: boolean;
          is_banned: boolean;
          age: number | null;
          profile_complete: boolean;
        }[]
      | undefined;
    const existing = rows?.[0];

    let row: {
      id: string;
      email: string;
      display_name: string;
      is_admin: boolean;
      age: number | null;
      profile_complete: boolean;
    };

    if (existing) {
      if (existing.is_banned) {
        return NextResponse.json(
          { error: "تم حظر هذا الحساب من إدارة المنصة — تواصل مع الدعم لو عندك استفسار." },
          { status: 403 }
        );
      }
      // اربط الـ firebase_uid بالحساب لو أول مرة (حساب اتعمل قبل كده بنفس الإيميل)
      await sql`UPDATE users SET firebase_uid = ${identity.uid} WHERE id = ${existing.id}`;
      row = existing;
    } else {
      const id = randomUUID();
      const placeholderName = identity.name?.trim() || identity.email.split("@")[0];
      await sql`
        INSERT INTO users (id, email, password_hash, display_name, is_admin, firebase_uid, age, profile_complete)
        VALUES (${id}, ${identity.email}, NULL, ${placeholderName}, FALSE, ${identity.uid}, NULL, FALSE)
      `;
      await sql`
        INSERT INTO user_quota (user_id, total_allocated_tokens, used_tokens)
        VALUES (${id}, ${REGISTERED_TOKEN_QUOTA}, 0)
        ON CONFLICT (user_id) DO NOTHING
      `;
      row = {
        id,
        email: identity.email,
        display_name: placeholderName,
        is_admin: false,
        age: null,
        profile_complete: false,
      };

      saveProfileToFirestore(identity.uid, {
        email: identity.email,
        name: placeholderName,
        age: null,
        photoURL: identity.picture,
      });
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

    const res = NextResponse.json({ user, needsProfile: !row.profile_complete });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_COOKIE_MAX_AGE,
    });
    return res;
  } catch (e) {
    console.error("google auth error", e);
    return NextResponse.json(
      { error: "تعذر تسجيل الدخول بجوجل، حاول تاني" },
      { status: 500 }
    );
  }
}
