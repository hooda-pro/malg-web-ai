import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getQuotaSnapshot } from "@/lib/quota";
import { getUserFlags, ACCOUNT_CHECK_UNAVAILABLE_MESSAGE } from "@/lib/usageGuard";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ quota: null });

  await ensureSchema();
  const flags = await getUserFlags(user.id);
  if (!flags) {
    return NextResponse.json(
      { error: ACCOUNT_CHECK_UNAVAILABLE_MESSAGE },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }
  const { isAdmin } = flags;
  const snap = await getQuotaSnapshot(user.id, isAdmin);

  return NextResponse.json({
    quota: {
      totalAllocatedTokens: snap.totalAllocatedTokens,
      usedTokens: snap.usedTokens,
      quotaExhaustedAt: snap.quotaExhaustedAt,
      renewsAt: snap.renewsAt,
      isAdmin,
    },
  });
}
