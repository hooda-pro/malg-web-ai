import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { COOKIE_NAME, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  await ensureSchema();

  // نسخة Firestore best-effort قبل مسح صف اليوزر (نحتاج firebase_uid)
  try {
    const rows = (await sql`SELECT firebase_uid FROM users WHERE id = ${user.id}`) as {
      firebase_uid: string | null;
    }[];
    const uid = rows[0]?.firebase_uid;
    if (uid) {
      const { deleteProfileFromFirestore } = await import("@/lib/firebaseAdmin");
      await deleteProfileFromFirestore(uid).catch(() => {});
    }
  } catch {
    // best-effort — لا يمنع حذف الحساب
  }

  // CASCADE يحذف الشات والكوتة والذاكرة ومفاتيح API تلقائيًا
  await sql`DELETE FROM users WHERE id = ${user.id}`;

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}
