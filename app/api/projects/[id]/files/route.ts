import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { listProjectFiles, replaceProjectFiles } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف ناقص" }, { status: 400 });
  await ensureSchema();
  const files = await listProjectFiles(user.id, id);
  if (!files) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  return NextResponse.json({ files });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف ناقص" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const files = body?.files;
  if (!Array.isArray(files) || files.length > 20) {
    return NextResponse.json({ error: "files مصفوفة حتى 20 ملفًا" }, { status: 400 });
  }
  for (const f of files) {
    if (
      typeof f?.path !== "string" || !f.path.trim() || f.path.length > 120 ||
      typeof f?.content !== "string" || f.content.length > 12000 ||
      (f?.lang !== undefined && (typeof f.lang !== "string" || f.lang.length > 20))
    ) {
      return NextResponse.json({ error: "ملف غير صالح (path≤120، lang≤20، content≤12000)" }, { status: 400 });
    }
  }
  await ensureSchema();
  const clean = files.map((f: any) => ({
    path: String(f.path).trim().replace(/\u0000/g, ""),
    lang: String(f.lang ?? "").slice(0, 20).replace(/\u0000/g, ""),
    content: String(f.content).replace(/\u0000/g, ""),
  }));
  const saved = await replaceProjectFiles(user.id, id, clean);
  if (!saved) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  return NextResponse.json({ files: saved });
}
