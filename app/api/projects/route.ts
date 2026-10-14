import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { listProjects, createProject } from "@/lib/projects";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  await ensureSchema();
  const projects = await listProjects(user.id);
  return NextResponse.json({ projects });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "اسم المشروع مطلوب (حتى 60 حرفًا)" }, { status: 400 });
  }
  await ensureSchema();
  // منع NUL (Postgres text يرفضه) — نفس حماية المرفقات
  const clean = name.replace(/\u0000/g, "");
  const project = await createProject(user.id, clean);
  return NextResponse.json({ project });
}
