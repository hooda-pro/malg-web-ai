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
    endedAt: row.ended_at ?? null,
    endedReason: row.ended_reason ?? null,
    endedBy: row.ended_by ?? null,
    isPinned: !!row.is_pinned,
    shareToken: row.share_token ?? null,
  };
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ sessions: [] });

  await ensureSchema();
  // تنظيف الجلسات المؤقتة اليتيمة (أقدم من يوم) — piggyback رخيص على القراءة
  try {
    await sql`DELETE FROM chat_sessions WHERE user_id = ${user.id} AND is_temp = TRUE AND updated_at < now() - INTERVAL '24 hours'`;
  } catch {
    // تجاهل — عمود is_temp قد لا يوجد قبل أول migration
  }
  let rows: any[];
  try {
    rows = await sql`
      SELECT id, title, created_at, updated_at, ended_at, ended_reason, ended_by, is_pinned, share_token FROM chat_sessions
      WHERE user_id = ${user.id} AND COALESCE(is_temp, FALSE) = FALSE
      ORDER BY is_pinned DESC, updated_at DESC
    `;
  } catch {
    // قاعدة قديمة قبل migration — الاستعلام الأصلي
    rows = await sql`
      SELECT id, title, created_at, updated_at, ended_at, ended_reason, ended_by FROM chat_sessions
      WHERE user_id = ${user.id} ORDER BY updated_at DESC
    `;
  }
  return NextResponse.json({ sessions: rows.map(mapSession) });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  await ensureSchema();
  let title = "محادثة جديدة";
  let isTemp = false;
  try {
    const body = await req.json();
    if (body?.title && typeof body.title === "string") title = body.title;
    if (body?.isTemp === true) isTemp = true;
  } catch {
    // بدون body، استخدم الافتراضي
  }

  const id = randomUUID();
  let rows: any[];
  try {
    rows = await sql`
      INSERT INTO chat_sessions (id, user_id, title, is_temp)
      VALUES (${id}, ${user.id}, ${title}, ${isTemp})
      RETURNING id, title, created_at, updated_at, ended_at, ended_reason, ended_by, is_pinned, share_token
    `;
  } catch {
    rows = await sql`
      INSERT INTO chat_sessions (id, user_id, title)
      VALUES (${id}, ${user.id}, ${title})
      RETURNING id, title, created_at, updated_at, ended_at, ended_reason, ended_by
    `;
  }
  return NextResponse.json({ session: mapSession(rows[0]) });
}
