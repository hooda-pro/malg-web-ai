import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getQuotaSnapshot } from "@/lib/quota";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ quota: null });

  await ensureSchema();
  const snap = await getQuotaSnapshot(user.id, user.isAdmin);

  return NextResponse.json({
    quota: {
      totalAllocatedTokens: snap.totalAllocatedTokens,
      usedTokens: snap.usedTokens,
      quotaExhaustedAt: snap.quotaExhaustedAt,
      renewsAt: snap.renewsAt,
      isAdmin: user.isAdmin,
    },
  });
}
