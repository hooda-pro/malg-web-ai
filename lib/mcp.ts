import { sql } from "./db";

// MCP client (Streamable HTTP) — lets the model call tools on admin-configured
// external servers (video, images, data...), same pattern as Claude's connectors.
// Security: ONLY admins configure servers (no user-supplied URLs => no SSRF from
// users). Per-call timeouts + output truncation + tool count caps.

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
  /** auto-wired from env (not stored, not deletable from the panel) */
  auto?: boolean;
}

export interface McpToolEntry {
  serverId: string;
  serverName: string;
  tool: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SETTINGS_KEY = "mcp_servers";
const TOOLS_CACHE_MS = 5 * 60_000;
const MAX_SERVERS = 10;
const MAX_TOOLS_TOTAL = 25;
const INIT_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 90_000;
const MAX_OUTPUT_CHARS = 6_000;

const toolsCache = new Map<string, { at: number; tools: McpToolEntry[] }>();

function slug(s: string, max: number): string {
  const t = String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
  return t || "srv";
}

/** OpenAI function names: [a-zA-Z0-9_-]{1,64} */
function fnName(serverId: string, tool: string): string {
  const sid = slug(serverId, 16);
  const rest = 64 - "mcp__".length - sid.length - 2;
  const tn = String(tool || "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, Math.max(rest, 1));
  return `mcp__${sid}__${tn || "tool"}`;
}

export async function listMcpServers(): Promise<McpServerConfig[]> {
  try {
    const rows = (await sql`SELECT value FROM app_settings WHERE key = ${SETTINGS_KEY}`) as {
      value: unknown;
    }[];
    const v = rows[0]?.value as { servers?: unknown } | null;
    if (!v || !Array.isArray(v.servers)) return [];
    const servers: McpServerConfig[] = (v.servers as Record<string, unknown>[])
      .filter((s) => s && typeof s === "object")
      .map((s) => ({
        id: slug(String(s.id ?? s.name ?? ""), 24),
        name: String(s.name ?? "").trim().slice(0, 60) || "MCP",
        url: String(s.url ?? "").trim().replace(/\/+$/, ""),
        headers:
          s.headers && typeof s.headers === "object"
            ? Object.fromEntries(
                Object.entries(s.headers as Record<string, unknown>)
                  .filter(([k, val]) => k && typeof val === "string")
                  .slice(0, 10)
                  .map(([k, val]) => [k, String(val).slice(0, 500)])
              )
            : {},
        enabled: s.enabled !== false,
      }))
      .filter((s) => /^https?:\/\//i.test(s.url))
      .slice(0, MAX_SERVERS);
    // Tavily auto-wire: reuses the existing TAVILY_API_KEY env - zero admin setup.
    // (GitHub/Neon need personal tokens, so the admin adds those by hand.)
    const tavilyKey = (process.env.TAVILY_API_KEY || "").trim();
    if (tavilyKey && !servers.some((s) => s.url.includes("mcp.tavily.com"))) {
      servers.push({
        id: "auto-tavily",
        name: "Tavily",
        url: "https://mcp.tavily.com/mcp/",
        headers: { Authorization: `Bearer ${tavilyKey}` },
        enabled: true,
        auto: true,
      });
    }
    return servers;
  } catch {
    return [];
  }
}

export async function saveMcpServers(input: unknown): Promise<McpServerConfig[]> {
  const arr = Array.isArray(input) ? input : [];
  const cleaned = arr
    .filter((s) => s && typeof s === "object")
    .filter((s) => (s as Record<string, unknown>).id !== "auto-tavily")
    .slice(0, MAX_SERVERS)
    .map((s) => {
      const r = s as Record<string, unknown>;
      const url = String(r.url ?? "").trim().replace(/\/+$/, "");
      if (!/^https?:\/\//i.test(url)) throw new Error("رابط غير صالح (لازم http(s)): " + url.slice(0, 80));
      const name = String(r.name ?? "").trim().slice(0, 60) || new URL(url).hostname;
      const headers: Record<string, string> = {};
      if (r.headers && typeof r.headers === "object") {
        for (const [k, v] of Object.entries(r.headers as Record<string, unknown>).slice(0, 10)) {
          if (k && typeof v === "string" && v) headers[k.slice(0, 100)] = v.slice(0, 2000);
        }
      }
      const id = slug(String(r.id ?? name), 24);
      return { id, name, url, headers, enabled: r.enabled !== false };
    });
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (${SETTINGS_KEY}, ${JSON.stringify({ servers: cleaned })}, now())
    ON CONFLICT (key) DO UPDATE SET value = ${JSON.stringify({ servers: cleaned })}, updated_at = now()
  `;
  toolsCache.clear();
  return cleaned as McpServerConfig[];
}

async function mcpPost(
  server: McpServerConfig,
  body: Record<string, unknown>,
  timeoutMs: number,
  sessionId?: string
): Promise<{ json: Record<string, unknown>; sessionId?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(server.headers ?? {}),
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const res = await fetch(server.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    const sid = res.headers.get("mcp-session-id") || undefined;
    try {
      return { json: JSON.parse(text) as Record<string, unknown>, sessionId: sid };
    } catch {
      // SSE response: last data: JSON wins
    }
    let last: Record<string, unknown> | null = null;
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const d = t.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        last = JSON.parse(d) as Record<string, unknown>;
      } catch {
        // keep scanning
      }
    }
    if (last) return { json: last, sessionId: sid };
    throw new Error("رد غير مفهوم من سيرفر MCP");
  } finally {
    clearTimeout(timer);
  }
}

let rpcId = 1;

async function listServerTools(server: McpServerConfig): Promise<McpToolEntry[]> {
  const cached = toolsCache.get(server.id);
  if (cached && Date.now() - cached.at < TOOLS_CACHE_MS) return cached.tools;
  const init = await mcpPost(
    server,
    {
      jsonrpc: "2.0",
      id: rpcId++,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "malg", version: "1.0" },
      },
    },
    INIT_TIMEOUT_MS
  );
  const sid = init.sessionId;
  try {
    await mcpPost(server, { jsonrpc: "2.0", method: "notifications/initialized" }, INIT_TIMEOUT_MS, sid);
  } catch {
    // some servers don't expect a response — continue anyway
  }
  const listed = await mcpPost(
    server,
    { jsonrpc: "2.0", id: rpcId++, method: "tools/list", params: {} },
    INIT_TIMEOUT_MS,
    sid
  );
  const result = listed.json.result as { tools?: Array<Record<string, unknown>> } | undefined;
  const tools: McpToolEntry[] = Array.isArray(result?.tools)
    ? result.tools.slice(0, 30).map((t) => ({
        serverId: server.id,
        serverName: server.name,
        tool: String(t.name ?? ""),
        description: String(t.description ?? "").slice(0, 500),
        inputSchema:
          t.inputSchema && typeof t.inputSchema === "object"
            ? (t.inputSchema as Record<string, unknown>)
            : { type: "object", properties: {} },
      }))
    : [];
  toolsCache.set(server.id, { at: Date.now(), tools });
  return tools;
}

export interface McpToolset {
  defs: unknown[];
  byName: Map<string, McpToolEntry>;
}

/** كل أدوات كل السيرفرات المفعّلة — تُبنى كل طلب (كاش 5 دقايق لكل سيرفر). */
export async function getMcpTools(): Promise<McpToolset> {
  const defs: unknown[] = [];
  const byName = new Map<string, McpToolEntry>();
  let servers: McpServerConfig[] = [];
  try {
    servers = (await listMcpServers()).filter((s) => s.enabled);
  } catch {
    return { defs, byName };
  }
  for (const server of servers) {
    let tools: McpToolEntry[] = [];
    try {
      tools = await listServerTools(server);
    } catch (e) {
      console.warn("[mcp] list tools failed for", server.id, e instanceof Error ? e.message : e);
      continue;
    }
    for (const t of tools) {
      if (defs.length >= MAX_TOOLS_TOTAL) break;
      const name = fnName(server.id, t.tool);
      if (byName.has(name)) continue;
      byName.set(name, t);
      defs.push({
        type: "function",
        function: {
          name,
          description: `[${server.name}] ${t.description || t.tool}`.slice(0, 500),
          parameters: t.inputSchema,
        },
      });
    }
    if (defs.length >= MAX_TOOLS_TOTAL) break;
  }
  return { defs, byName };
}

export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ ok: boolean; text: string }> {
  const servers = await listMcpServers().catch(() => [] as McpServerConfig[]);
  const server = servers.find((s) => s.id === serverId && s.enabled);
  if (!server) return { ok: false, text: "سيرفر MCP غير موجود أو موقوف." };
  try {
    const init = await mcpPost(
      server,
      {
        jsonrpc: "2.0",
        id: rpcId++,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "malg", version: "1.0" },
        },
      },
      INIT_TIMEOUT_MS
    );
    const sid = init.sessionId;
    try {
      await mcpPost(server, { jsonrpc: "2.0", method: "notifications/initialized" }, INIT_TIMEOUT_MS, sid);
    } catch {
      // continue anyway
    }
    const r = await mcpPost(
      server,
      { jsonrpc: "2.0", id: rpcId++, method: "tools/call", params: { name: toolName, arguments: args ?? {} } },
      CALL_TIMEOUT_MS,
      sid
    );
    const result = r.json.result as
      | { content?: Array<Record<string, unknown>>; isError?: boolean }
      | undefined;
    const parts: string[] = [];
    if (Array.isArray(result?.content)) {
      for (const c of result.content) {
        if (typeof c.text === "string") parts.push(c.text);
        else if (c.type === "image" || c.type === "audio") parts.push(`[${c.type} output — غير معروض نصًا]`);
        else parts.push(JSON.stringify(c).slice(0, 2000));
        if (parts.join("\n").length > MAX_OUTPUT_CHARS) break;
      }
    }
    const text = parts.join("\n").slice(0, MAX_OUTPUT_CHARS) || "(لا يوجد إخراج نصي)";
    if (result?.isError) return { ok: false, text };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, text: e instanceof Error ? e.message.slice(0, 1000) : String(e).slice(0, 1000) };
  }
}

/** List tool names on a server without saving it (admin Test button). */
export async function testMcpServer(
  url: string,
  headers: Record<string, string>
): Promise<string[]> {
  const server: McpServerConfig = {
    id: "test",
    name: "test",
    url: url.trim().replace(/\/+$/, ""),
    headers: headers ?? {},
    enabled: true,
  };
  if (!/^https?:\/\//i.test(server.url)) throw new Error("Invalid URL");
  toolsCache.delete("test");
  const tools = await listServerTools(server);
  return tools.map((t) => t.tool);
}
