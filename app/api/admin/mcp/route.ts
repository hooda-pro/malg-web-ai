import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { listMcpServers, saveMcpServers, testMcpServer } from "@/lib/mcp";

export const dynamic = "force-dynamic";

/**
 * إدارة سيرفرات MCP الخارجية (الأدمن فقط):
 * - GET: القايمة الحالية (قيم الهيدرز مخفية)
 * - POST {servers}: حفظ/استبدال القايمة (تحقق صارم — روابط http(s) فقط)
 * - POST {action:"test", url, headers}: تجربة سيرفر قبل حفظه (يرجع أسماء الأدوات)
 */
export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;
  await ensureSchema();
  const servers = await listMcpServers().catch(() => []);
  const safe = servers.map((s) => ({
    ...s,
    headers: s.headers ? Object.fromEntries(Object.keys(s.headers).map((k) => [k, "..."])) : {},
  }));
  return NextResponse.json({ servers: safe });
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;
  await ensureSchema();
  const body = await req.json().catch(() => ({}));

  if (body?.action === "test") {
    const url = String(body?.url ?? "").trim();
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: "Invalid URL (http(s) required)" }, { status: 400 });
    }
    const headers =
      body?.headers && typeof body.headers === "object"
        ? (body.headers as Record<string, string>)
        : {};
    try {
      const tools = await testMcpServer(url, headers);
      return NextResponse.json({ ok: true, tools });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to reach server" },
        { status: 502 }
      );
    }
  }

  try {
    const saved = await saveMcpServers(body?.servers);
    await logAdminAction(
      guard.admin,
      "save_mcp_servers",
      null,
      null,
      `Saved ${saved.length} MCP servers`
    );
    return NextResponse.json({ ok: true, servers: saved });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid data" },
      { status: 400 }
    );
  }
}
