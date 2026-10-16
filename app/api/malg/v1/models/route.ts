import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ModelRow {
  id: string;
  name: string;
  description: string | null;
  tier: string | null;
  cost_multiplier: number | null;
  is_active: boolean;
  is_default: boolean | null;
  created_at?: string | null;
}

/**
 * GET /api/malg/v1/models — OpenAI-compatible model list.
 * No auth required (mirrors OpenAI /v1/models). Light rate-limiting
 * is handled upstream by the platform; this endpoint is read-only.
 */
export async function GET() {
  try {
    await ensureSchema();
    const rows = (await sql`
      SELECT id, name, description, tier, cost_multiplier, is_active, is_default, created_at
      FROM ai_models
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, created_at ASC
    `) as ModelRow[];

    const data = rows.map((r) => ({
      id: r.id,
      object: "model" as const,
      created: r.created_at ? Math.floor(new Date(r.created_at).getTime() / 1000) : 0,
      owned_by: "malg",
      display_name: r.name,
      description: r.description ?? "",
      tier: r.tier === "paid" ? "paid" : "free",
      cost_multiplier: Number(r.cost_multiplier ?? 1) || 1,
      is_default: r.is_default === true,
    }));

    return NextResponse.json({ object: "list", data });
  } catch (e) {
    console.error("models endpoint failed", e);
    return NextResponse.json({ object: "list", data: [] });
  }
}
