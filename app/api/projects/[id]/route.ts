import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { updateProject, deleteProject, listProjectFiles } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف ناقص" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const patch: { name?: string; instructions?: string } = {};
  if (body?.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 60) {
      return NextResponse.json({ error: "الاسم حتى 60 حرفًا وغير فارغ" }, { status: 400 });
    }
    patch.name = body.name.trim().replace(/\u0000/g, "");
  }
  if (body?.instructions !== undefined) {
    if (typeof body.instructions !== "string" || body.instructions.length > 2000) {
      return NextResponse.json({ error: "التعليمات حتى 2000 حرف" }, { status: 400 });
    }
    patch.instructions = body.instructions.replace(/\u0000/g, "");
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "لا يوجد ما يُحدَّث" }, { status: 400 });
  }
  await ensureSchema();
  const project = await updateProject(user.id, id, patch);
  if (!project) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  return NextResponse.json({ project });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "معرّف ناقص" }, { status: 400 });
  await ensureSchema();
  const ok = await deleteProject(user.id, id);
  if (!ok) return NextResponse.json({ error: "المشروع غير موجود" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// GET يجلب ملفات المشروع (مريح للوحة)
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
