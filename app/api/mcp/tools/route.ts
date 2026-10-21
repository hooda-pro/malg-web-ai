import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getMcpTools, type McpToolEntry } from "@/lib/mcp";

export const dynamic = "force-dynamic";

/**
 * أدوات MCP المفعّلة حاليًا (اللي الأدمن ضافها من لوحة التحكم) — للمستخدمين المسجّلين، وبتستخدمها
 * تطبيقات الموبايل عشان تعرض نفس الأدوات اللي الموديل بيقدر يستخدمها في الشات.
 * بنرجّع الأسماء والوصف بس: مفيش روابط سيرفرات ولا هيدرز ولا أي سر. الأدوات نفسها بتتنفّذ
 * على السيرفر (/api/chat) لكل العملاء، فالتطبيق مش محتاج يتصل بسيرفرات MCP مباشرة.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  await ensureSchema();
  const toolset = await getMcpTools().catch(() => ({ byName: new Map<string, McpToolEntry>() }));
  const tools = [...toolset.byName.values()].map((t) => ({
    server: t.serverName,
    name: t.tool,
    description: String(t.description || "").slice(0, 300),
  }));
  return NextResponse.json({ tools });
}
