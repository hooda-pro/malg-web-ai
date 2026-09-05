import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ensureUserQuota } from "@/lib/quota";
import { REGISTERED_TOKEN_QUOTA } from "@/lib/systemPrompt";

export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ quota: null });

  await ensureSchema();
  await ensureUserQuota(user.id);

  const rows = await sql`
    SELECT total_allocated_tokens, used_tokens, quota_exhausted_at
    FROM user_quota WHERE user_id = ${user.id}
  `;
  const row = rows[0] as
    | { total_allocated_tokens: number; used_tokens: number; quota_exhausted_at: string | null }
    | undefined;

  return NextResponse.json({
    quota: {
      totalAllocatedTokens: Number(row?.total_allocated_tokens ?? REGISTERED_TOKEN_QUOTA),
      usedTokens: Number(row?.used_tokens ?? 0),
      quotaExhaustedAt: row?.quota_exhausted_at ?? null,
      isAdmin: user.isAdmin,
    },
  });
}
