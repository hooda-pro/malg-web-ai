import { sql } from "./db";

/**
 * إعدادات البحث الحقيقي (Tavily) — الأدمن بيتحكم فيها من لوحة الإدارة.
 * الأولوية: جدول app_settings، ولو مفيش بنرجع لمفاتيح env القديمة كـ fallback.
 */

export interface SearchSettings {
  enabled: boolean;
  apiKeys: string[];
  keysCount: number;
  fromEnv: boolean;
}

function envTavilyKeys(): string[] {
  const keys: string[] = [];
  const numberedPattern = /^TAVILY_API_KEYS?_?(\d+)$/i;
  const numbered = Object.keys(process.env)
    .map((name) => {
      const m = name.match(numberedPattern);
      return m ? { name, index: parseInt(m[1], 10) } : null;
    })
    .filter((x): x is { name: string; index: number } => x !== null)
    .sort((a, b) => a.index - b.index);
  for (const entry of numbered) {
    const v = process.env[entry.name];
    if (v && v.trim()) keys.push(v.trim());
  }
  const bulk = process.env.TAVILY_API_KEY || process.env.TAVILY_API_KEYS || "";
  for (const k of bulk.split(/[\n,;]+/)) {
    const t = k.trim();
    if (t) keys.push(t);
  }
  return [...new Set(keys)];
}

let cache: { settings: SearchSettings; at: number } | null = null;
const CACHE_MS = 15_000;

export function invalidateSearchCache() {
  cache = null;
}

export async function getSearchSettings(): Promise<SearchSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.settings;
  try {
    const rows = (await sql`
      SELECT value FROM app_settings WHERE key = 'search'
    `) as { value: unknown }[];
    const v = (rows[0]?.value ?? null) as { enabled?: unknown; apiKeys?: unknown } | null;
    if (v && typeof v === "object") {
      const apiKeys = Array.isArray(v.apiKeys)
        ? [...new Set(v.apiKeys.map((k) => String(k ?? "").trim()).filter(Boolean))].slice(0, 10)
        : [];
      // لو متخزن إعداد بمفاتيح فاضية وكان env فيه مفاتيح — استخدم env كمكمل
      const merged = apiKeys.length > 0 ? apiKeys : envTavilyKeys();
      const settings: SearchSettings = {
        enabled: v.enabled !== false,
        apiKeys: merged,
        keysCount: merged.length,
        fromEnv: apiKeys.length === 0 && merged.length > 0,
      };
      cache = { settings, at: Date.now() };
      return settings;
    }
  } catch {
    // الجدول لسه متعملش — fallback
  }
  const fallback: SearchSettings = {
    enabled: true,
    apiKeys: envTavilyKeys(),
    keysCount: envTavilyKeys().length,
    fromEnv: true,
  };
  fallback.keysCount = fallback.apiKeys.length;
  cache = { settings: fallback, at: Date.now() };
  return fallback;
}

export async function saveSearchSettings(input: {
  enabled: boolean;
  /** null = سيب المفاتيح القديمة زي ما هي */
  apiKeys: string[] | null;
}): Promise<SearchSettings> {
  const prev = await getSearchSettings();
  const apiKeys = input.apiKeys === null ? prev.apiKeys : input.apiKeys;
  const value = JSON.stringify({ enabled: input.enabled, apiKeys });
  await sql`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('search', ${value}::jsonb, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
  invalidateSearchCache();
  return getSearchSettings();
}
