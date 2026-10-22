import { NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { isVoiceModelRow } from "@/lib/provider";

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
  modality?: string | null;
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
 * ملاحظة اكتشاف: Claude Code وأدواته (وأمثالها GUI) بتفلتر القايمة وتاخد بس
 * معرّف فيه claude أو anthropic — فكل موديل بيتبعت له نسخة توافق claude-{id}
 * تخدم نفس الموديل بالظبط، عشان البرامج دي تشوف القايمة كاملة.
 * كمان لو القايمة فاضية تمامًا، مفتاح توافق واحد claude-malg بيتضاف عشان
 * الاكتشاف ميرجعش صفر نماذج.
 */
export async function GET() {
  try {
    await ensureSchema();
    const rows = (await sql`
      SELECT id, name, model, description, tier, cost_multiplier, is_default, created_at, modality
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
      // موديلات الصوت: واجهة منفصلة "قريبًا" — متتعرضش أصلًا في قايمة شات الـAPI
      if (isVoiceModelRow(r.id, r.modality)) continue;
      // المعرّف الأصلي اللي الأدمن ضبطه
      if (!seen.has(r.id)) {
        seen.add(r.id);
        data.push({
          id: r.id,
          object: "model",
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
      // نسخة التوافق لفلاتر Claude Code — نفس الموديل بالظبط
      const compatId = `claude-${r.id}`;
      if (!seen.has(compatId)) {
        seen.add(compatId);
        data.push({
          id: compatId,
          object: "model",
          type: "model",
          created: 0,
          owned_by: "malg",
          display_name: r.name,
          description: `Compat alias — serves model ${r.id} exactly.`,
          tier: r.tier === "paid" ? "paid" : "free",
          cost_multiplier: Number(r.cost_multiplier ?? 1) || 1,
          is_default: r.is_default === true,
        });
      }
    }

    // شاملة الأمان: لو مفيش أي صف نشط خالص — الاكتشاف ميرجعش فارغ تمامًا
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
