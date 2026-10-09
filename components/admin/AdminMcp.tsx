import { useCallback, useEffect, useState } from "react";
import { Loader2, Plug, Plus, Trash2, FlaskConical } from "lucide-react";
import type { McpServerConfig } from "@/lib/mcp";

interface TestState {
  loading: boolean;
  tools?: string[];
  error?: string;
}

/** إدارة سيرفرات MCP الخارجية — الأدمن يضيف روابط سيرفرات، والموديل يستدعي أدواتها */
export default function AdminMcp({ notify }: { notify: (type: "ok" | "err", text: string) => void }) {
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [test, setTest] = useState<TestState>({ loading: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/mcp");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setServers(Array.isArray(data.servers) ? data.servers : []);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const parseHeaders = (): Record<string, string> => {
    const t = headersText.trim();
    if (!t) return {};
    const obj = JSON.parse(t) as unknown;
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("Headers must be a JSON object");
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (k && typeof v === "string" && v) out[k] = v;
    }
    return out;
  };

  const persist = async (next: McpServerConfig[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servers: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setServers(Array.isArray(data.servers) ? data.servers : next);
      notify("ok", "MCP servers saved");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    if (!name.trim() || !url.trim() || saving) return;
    let headers: Record<string, string> = {};
    try {
      headers = parseHeaders();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Bad headers JSON");
      return;
    }
    await persist([...servers, { id: "", name: name.trim(), url: url.trim(), headers, enabled: true }]);
    setName("");
    setUrl("");
    setHeadersText("");
  };

  const remove = async (id: string) => {
    await persist(servers.filter((s) => s.id !== id));
  };

  const toggle = async (id: string) => {
    await persist(servers.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const runTest = async () => {
    if (!url.trim()) return;
    let headers: Record<string, string> = {};
    try {
      headers = parseHeaders();
    } catch (e) {
      setTest({ loading: false, error: e instanceof Error ? e.message : "Bad headers JSON" });
      return;
    }
    setTest({ loading: true });
    try {
      const res = await fetch("/api/admin/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test", url: url.trim(), headers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      setTest({ loading: false, tools: Array.isArray(data.tools) ? data.tools : [] });
    } catch (e) {
      setTest({ loading: false, error: e instanceof Error ? e.message : "Test failed" });
    }
  };

  const inputCls =
    "w-full rounded-md border border-hair bg-surface-2 px-3 py-2 text-[13px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-accent";

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-ink-3">
        <Loader2 size={18} className="animate-spin text-accent" />
        <span className="text-[13px]">Loading MCP servers...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="rounded-lg border border-hair bg-surface p-4 shadow-1">
        <div className="mb-3 flex items-center gap-2">
          <Plug size={15} className="text-accent" />
          <h2 className="text-[13px] font-semibold text-ink">External MCP servers</h2>
        </div>
        <p className="mb-3 text-[12px] leading-5 text-ink-3">
          Servers you add here expose their tools to the model (as mcp__server__tool). Only admins can
          configure URLs — users can never add their own.
        </p>

        {servers.length === 0 && (
          <p className="rounded-md bg-surface-2 px-3 py-2 text-[12px] text-ink-3">
            No MCP servers configured.
          </p>
        )}
        <div className="space-y-2">
          {servers.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-md border border-hair bg-surface-2 px-3 py-2"
            >
              {!s.auto && (
              <button
                onClick={() => toggle(s.id)}
                title={s.enabled ? "Disable" : "Enable"}
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors ${
                  s.enabled ? "text-live" : "text-ink-3"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${s.enabled ? "bg-live" : "bg-surface-3"}`}
                />
              </button>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-ink">
                  {s.name}
                  {s.auto && (
                    <span className="shrink-0 rounded-full bg-live-soft px-1.5 py-px text-[10px] font-medium text-live">
                      auto
                    </span>
                  )}
                </p>
                <p className="tnum truncate text-[11.5px] text-ink-3" dir="ltr">
                  {s.url}
                </p>
              </div>
              {!s.auto && (
              <button
                onClick={() => remove(s.id)}
                title="Delete server"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2 rounded-md border border-hair bg-surface-2 p-3">
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name (e.g. Video)"
              className={inputCls}
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://... (Streamable HTTP)"
              dir="ltr"
              className={`${inputCls} tnum`}
            />
          </div>
          <input
            value={headersText}
            onChange={(e) => setHeadersText(e.target.value)}
            placeholder='Headers JSON (optional): {"Authorization":"Bearer ..."}'
            dir="ltr"
            className={`${inputCls} tnum font-mono text-[12px]`}
          />
          <div className="flex gap-2">
            <button
              onClick={add}
              disabled={saving || !name.trim() || !url.trim()}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Add server
            </button>
            <button
              onClick={runTest}
              disabled={test.loading || !url.trim()}
              className="flex items-center gap-1.5 rounded-md border border-hair bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-2 hover:border-accent-line hover:text-accent disabled:opacity-40"
            >
              {test.loading ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
              Test
            </button>
          </div>
          {test.tools && (
            <p className="tnum rounded-md bg-live-soft px-3 py-2 text-[12px] text-live" dir="ltr">
              {test.tools.length} tools: {test.tools.slice(0, 12).join(", ")}
              {test.tools.length > 12 ? "..." : ""}
            </p>
          )}
          {test.error && (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-[12px] text-danger" dir="auto">
              {test.error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
