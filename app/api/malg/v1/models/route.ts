import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

interface ModelRow {
  id: string;
  name: string;
  description: string | null;
  /** اسم المزوّد الحقيقي — زي claude-sonnet-5.5 مثلاً */
  model: string;
  tier: string | null;
  cost_multiplier: number | null;
  is_active: boolean;
  is_default: boolean | null;
  created_at?: string | null;
}

/** المعرّف الظاهر للعملاء من اسم المزوّد الحقيقي — نفس دالة sanitizeApiModel
 * في مسار الشات حرفيًا (lowercase + مسافات بشرطات + [a-z0-9._-]) عشان المعمية
 * بترجع المعرّف اللي شافه هنا والمزامنة تحصل بالبايت. فاضي → نسقط على id الصف. */
function realModelId(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 80);
}

/**
 * GET /api/malg/v1/models — قائمة الموديلات بنمط المنصات الكبيرة (OpenAI
 * /v1/models). مفيش مصادقة (زي OpenAI بالظبط) ونقطة قراءة بس.
 *
 * كل موديل بيتعرض بمعرّفه الحقيقي (اسم المزوّد) مش الـ slug الداخلي — والموتوره
 * في بلاغ الشات بيحسم الطلب بالاسم ده مباشرة (مفتاح واحد يغطي كل الموديلات).
 * مفتاح توافق واحد اسمه claude-malg بيتضاف بس لو مفيش أي معرّف حقيقي يعدّي
 * فلتر اكتشاف Claude Code (بياخد بس معرّف فيه claude أو anthropic).
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

    interface ListedModel {
      id: string;
      object: "model";
      type: "model";
      created: number;
      owned_by: string;
      display_name: string;
      description: string;
      tier: string;
      cost_multiplier: number;
      is_default: boolean;
    }

    const seen = new Set<string>();
    const data: ListedModel[] = [];
    for (const r of rows) {
      const listedId = realModelId(r.model) || r.id;
      // نفس المزوّد مايضيفش لإحصج مرتين — الترتيب بيحسم الأول
      if (seen.has(listedId)) continue;
      seen.add(listedId);
      data.push({
        id: listedId,
        object: "model",
        // حقل صنارة Anthropic إضافي — Claude Code بيعمل model discovery على
        // /v1/models بصيغة Anthropic (متوقع type:"model")، وأي عميل OpenAI
        // بيتجاهل الحقل زيادة بلا أثر.
        type: "model",
        created: r.created_at ? Math.floor(new Date(r.created_at).getTime() / 1000) : 0,
        owned_by: "malg",
        display_name: r.name,
        description: r.description ?? "",
        tier: r.tier === "paid" ? "paid" : "free",
        cost_multiplier: Number(r.cost_multiplier ?? 1) || 1,
        is_default: r.is_default === true,
      });
    }

    if (!data.some((m) => /claude|anthropic/.test(m.id))) {
      data.push({
        id: "claude-malg",
        object: "model",
        type: "model",
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
