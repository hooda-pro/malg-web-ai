import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { COOKIE_NAME, getSessionUser } from "@/lib/auth";
import {
  finalizeAccountDeletion,
  fetchPendingDeletion,
  logDeletionExpired,
  deletionExpired,
} from "@/lib/accountDeletion";

export const dynamic = "force-dynamic";

/**
 * فحص الجلسة:
 * - الحساب المجدول للحذف بيتعامل معاه وكأنه مسجل خروج (مجمد) — الكوكي بتاخد لاءي،
 *   سواء المهلة لسه شغالة أو خلصت.
 * - لو المهلة انتهت ونزوه: بيتحذف نهائيًا هنا، بكل بياناته (CASCADE)، مع تسجيل الحدث.
 */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ user: null });

  try {
    await ensureSchema();
    const pending = await fetchPendingDeletion(session.id);
    if (!pending) {
      return NextResponse.json({ user: session });
    }

    if (deletionExpired(pending.deletion_requested_at)) {
      await finalizeAccountDeletion(pending.id);
      await logDeletionExpired(pending);
    }

    // انجماد الهئام المسجلين — الجلسة بتتقفل
    const res = NextResponse.json({ user: null });
    res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return res;
  } catch (e) {
    console.error("auth/me error", e);
    return NextResponse.json({ user: null }, { status: 500 });
  }
}
