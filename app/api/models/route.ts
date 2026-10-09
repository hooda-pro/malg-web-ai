import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getDefaultModelId, listModels } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** قائمة الموديلات النشطة للواجهة (عام — بدون مفاتيح): id + اسم + وصف */
export async function GET() {
  await ensureSchema();
  const [models, defaultId] = await Promise.all([listModels(true), getDefaultModelId()]);
  const list = models.length > 0
    ? models
    : [{ id: "malg-a3", name: "Malg-A3", description: "", isDefault: true, isActive: true, keysCount: 0, updatedAt: null }];
  return NextResponse.json({
    models: list.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      isDefault: m.id === defaultId || !!m.isDefault,
    })),
    defaultId,
  });
}
