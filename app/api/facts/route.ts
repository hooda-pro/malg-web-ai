import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { listFacts, addFact } from "@/lib/facts";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  await ensureSchema();
  const facts = await listFacts(user.id, 50);
  return NextResponse.json({ facts });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const fact = typeof body?.fact === "string" ? body.fact.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "عام";
  if (!fact || fact.length > 300) {
    return NextResponse.json({ error: "الحقيقة مطلوبة (حتى 300 حرف)" }, { status: 400 });
  }
  if (category.length > 30) {
    return NextResponse.json({ error: "التصنيف حتى 30 حرفًا" }, { status: 400 });
  }
  await ensureSchema();
  const saved = await addFact(user.id, fact.replace(/\u0000/g, ""), (category || "عام").replace(/\u0000/g, ""));
  return NextResponse.json({ fact: saved });
}
