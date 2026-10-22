import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ModelRow {
  id: string;
  name: string;
  description: string | null;
  /** اسم المزوّد الحقيقي — مش بيُعرض كمعرّف، بس مطابقة الطلب بتقبله اختياريًا */
  model: string;
  tier: string | null;
  cost_multiplier: number | null;
  is_active: boolean;
  is_default: boolean | null;
  created_at?: string | null;
}

/**
 * GET /api/malg/v1/models — قائمة الموديلات بنمط المنصات الكبيرة (OpenAI
 * /v1/models). مفيش مصادقة (زي OpenAI بالظبط) ونقطة قراءة بس.
 *
 * المعرف الظاهر = نفس id الموديل اللي الأدمن ضابطه من لوحة الإدارة (مش اسم
 * المزوّد الخارجي) وdisplay_name = الاسم اللي إحنا بنحطه. مطابقة الطلب في
 * بلاغ الشات بتقبل الـid ده، وبالأسماء القديمة القليلة، واختياريًا باسم
 * المزوّد الحقيقي (لو حد ضبطه يدوي في أدواته).
 *
 * مفتاح توافق واحد اسمه claude-malg بيتضاف بس لو مفيش أي معرّف يعدّي فلتر
 * اكتشاف Claude Code (بياخد بس معرّف فيه claude أو anthropic).
 */
export async function GET() {
  try {
    await ensureSchema();
    const rows = (await sql`
      SELECT id, name, model, description, tier, cost_multiplier, is_default, created_at
      FROM ai_models
      WHERE is_active = TRUE
      ORDER BY sort_order ASC, created_at ASC
    `) as ModelRow[];

    const data = rows.map((r) => ({
      id: r.id,
      object: "model" as const,
      // حقل صنارة Anthropic إضافي — Claude Code بيعمل model discovery على
      // /v1/models بصيغة Anthropic (متوقع type:"model")، وأي عميل OpenAI
      // بيتجاهل الحقل زيادة بلا أثر.
      type: "model" as const,
      created: r.created_at ? Math.floor(new Date(r.created_at).getTime() / 1000) : 0,
      owned_by: "malg",
      display_name: r.name,
      description: r.description ?? "",
      tier: r.tier === "paid" ? "paid" : "free",
      cost_multiplier: Number(r.cost_multiplier ?? 1) || 1,
      is_default: r.is_default === true,
    }));

    if (!data.some((m) => /claude|anthropic/.test(m.id))) {
      data.push({
        id: "claude-malg",
        object: "model" as const,
        type: "model" as const,
        created: 0,
        owned_by: "malg",
        display_name: "MALG (Claude-compatible)",
        description:
          "Compat alias — the real model is picked from your request or is the platform default.",
        tier: "free",
        cost_multiplier: 1,
        is_default: false,
      });
    }

    return NextResponse.json({
      object: "list",
      data,
    // حقول قائمة Anthropic (ListModels: first_id/last_id/has_more) — نفس
    // الهدف: عميل Anthropic يلاقي رد شكل صحيح، وعميل OpenAI ميتأثرش.
    first_id: data.length > 0 ? data[0].id : null,
    last_id: data.length > 0 ? data[data.length - 1].id : null,
    has_more: false,
  });
  } catch (e) {
    console.error("models endpoint failed", e);
    return NextResponse.json({ object: "list", data: [] });
  }
}
