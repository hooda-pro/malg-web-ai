import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getQuotaSnapshot } from "@/lib/quota";
import { getUserFlags } from "@/lib/usageGuard";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ quota: null });

  await ensureSchema();
  const { isAdmin } = await getUserFlags(user.id);
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
