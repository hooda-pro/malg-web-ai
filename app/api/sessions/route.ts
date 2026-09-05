import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import type { ChatSession } from "@/lib/types";

function mapSession(row: any): ChatSession {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  const user = getSessionUser();
  if (!user) return NextResponse.json({ sessions: [] });

  await ensureSchema();
  const rows = await sql`
    SELECT id, title, created_at, updated_at FROM chat_sessions
    WHERE user_id = ${user.id} ORDER BY updated_at DESC
  `;
  return NextResponse.json({ sessions: rows.map(mapSession) });
}

export async function POST(req: NextRequest) {
  const user = getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  await ensureSchema();
  let title = "محادثة جديدة";
  try {
    const body = await req.json();
    if (body?.title && typeof body.title === "string") title = body.title;
  } catch {
    // بدون body، استخدم العنوان الافتراضي
  }

  const id = randomUUID();
  const rows = await sql`
    INSERT INTO chat_sessions (id, user_id, title)
    VALUES (${id}, ${user.id}, ${title})
    RETURNING id, title, created_at, updated_at
  `;
  return NextResponse.json({ session: mapSession(rows[0]) });
}
