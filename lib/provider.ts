import { sql } from "./db";

/**
 * إعدادات مزوّد الموديل النشط — الأدمن بيغيّرها من لوحة الإدارة
 * من غير ما يمس الكود أو متغيرات البيئة.
 *
 * الأولوية: صف `provider_settings` النشط في الداتابيز، ولو مفيش
 * بنرجع لإعدادات البيئة القديمة (Token Harbor) كـ fallback.
 */

export interface ProviderConfig {
  id: string;
  name: string;
  /** رابط /chat/completions الكامل — لازم يكون OpenAI-compatible */
  baseUrl: string;
  /** اسم الموديل زي ما المزوّد مسمّيه (مثال: deepseek-v4.1-flash:free) */
  model: string;
  /** المفاتيح الخام — موجودة على السيرفر بس، عمرها ما بتتبعت للواجهة */
  apiKeys: string[];
  temperature: number;
  maxTokens: number;
  isActive: boolean;
  updatedAt: string | null;
}

/** نفس الشكل بس بالمفتاح متخفي — ده اللي بيروح للواجهة */
export interface ProviderConfigPublic extends Omit<ProviderConfig, "apiKeys"> {
  maskedKeys: string[];
  keysCount: number;
}

const FALLBACK_BASE_URL = "https://tokenharbor.ai/v1/chat/completions";
const FALLBACK_MODEL = "deepseek-v4.1-flash:free";

/** مفاتيح env القديمة — بتستخدم كقيمة ابتدائية أول مرة بس */
function envKeys(): string[] {
  const keys: string[] = [];
  const numberedPattern = /^TOKENHARBOR_API_KEYS?_?(\d+)$/i;
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
  for (const varName of ["TOKENHARBOR_API_KEYS", "TOKENHARBOR_API_KEY"]) {
    const bulk = process.env[varName] || "";
    for (const k of bulk.split(/[\n,;]+/)) {
      const t = k.trim();
      if (t) keys.push(t);
    }
  }
  return [...new Set(keys)];
}

function envFallback(): ProviderConfig {
  return {
    id: "env-fallback",
    name: "Token Harbor (من متغيرات البيئة)",
    baseUrl: process.env.PROVIDER_BASE_URL?.trim() || FALLBACK_BASE_URL,
    model: process.env.PROVIDER_MODEL?.trim() || FALLBACK_MODEL,
    apiKeys: envKeys(),
    temperature: 0.4,
    maxTokens: 128000,
    isActive: true,
    updatedAt: null,
  };
}

/** كاش قصير في الذاكرة عشان كل رسالة شات متعملش استعلام زيادة */
let cache: { config: ProviderConfig; at: number } | null = null;
const CACHE_MS = 15_000;

export function invalidateProviderCache() {
  cache = null;
}

export function maskKey(key: string): string {
  const t = key.trim();
  if (t.length <= 8) return "••••";
  return `${t.slice(0, 4)}••••${t.slice(-4)}`;
}

export function toPublicConfig(c: ProviderConfig): ProviderConfigPublic {
  const { apiKeys, ...rest } = c;
  return { ...rest, maskedKeys: apiKeys.map(maskKey), keysCount: apiKeys.length };
}

export interface ProviderRow {
  id: string;
  name: string;
  base_url: string;
  model: string;
  api_keys: string[];
  temperature: unknown;
  max_tokens: unknown;
  is_active: boolean;
  updated_at: string | null;
}

export function rowToConfig(r: ProviderRow): ProviderConfig {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    model: r.model,
    apiKeys: Array.isArray(r.api_keys) ? r.api_keys.filter((k) => typeof k === "string" && k.trim()) : [],
    temperature: Number(r.temperature ?? 0.4),
    maxTokens: Number(r.max_tokens ?? 128000),
    isActive: r.is_active,
    updatedAt: r.updated_at,
  };
}
/**
 * المزوّد النشط الحالي — الداتابيز أولاً، وenv fallback لو الجدول فاضي.
 * التعليمات (system prompt) والـ agent loop والبحث والتخزين زي ما هما بالظبط،
 * اللي بيتغيّر بس: الرابط + الموديل + المفتاح.
 */
export async function getActiveProvider(): Promise<ProviderConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.config;
  try {
    const rows = (await sql`
      SELECT id, name, base_url, model, api_keys, temperature, max_tokens, is_active, updated_at
      FROM provider_settings
      WHERE is_active = TRUE
      ORDER BY updated_at DESC
      LIMIT 1
    `) as ProviderRow[];
    if (rows[0]) {
      const config = rowToConfig(rows[0]);
      cache = { config, at: Date.now() };
      return config;
    }
  } catch {
    // الجدول لسه متعملش (أول تشغيل قبل ensureSchema) — نرجع للـ fallback
  }
  const fallback = envFallback();
  cache = { config: fallback, at: Date.now() };
  return fallback;
}

/** آخر إعداد محفوظ حتى لو مش نشط — للعرض في لوحة الأدمن */
export async function getSavedProvider(): Promise<ProviderConfig | null> {
  try {
    const rows = (await sql`
      SELECT id, name, base_url, model, api_keys, temperature, max_tokens, is_active, updated_at
      FROM provider_settings
      ORDER BY updated_at DESC
      LIMIT 1
    `) as ProviderRow[];
    return rows[0] ? rowToConfig(rows[0]) : null;
  } catch {
    return null;
  }
}

/** تطبيع رابط المزوّد — يقبل الدومين لوحده أو المسار الكامل */
export function normalizeBaseUrl(input: string): string {
  const t = input.trim().replace(/\/+$/, "");
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) return `https://${t}/v1/chat/completions`;
  if (/\/chat\/completions\/?$/i.test(t)) return t;
  if (/\/v1\/?$/i.test(t)) return `${t}/chat/completions`;
  return `${t}/v1/chat/completions`;
}

export interface ProviderInput {
  name?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKeys?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
}

export type ProviderValidation =
  | { ok: true; value: { name: string; baseUrl: string; model: string; apiKeys: string[]; temperature: number; maxTokens: number } }
  | { ok: false; error: string };

export function validateProviderInput(input: ProviderInput): ProviderValidation {
  const name = String(input.name ?? "").trim().slice(0, 80) || "مزود مخصص";
  const baseUrl = normalizeBaseUrl(String(input.baseUrl ?? ""));
  if (!baseUrl) return { ok: false, error: "رابط المزوّد (Base URL) مطلوب" };
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad");
  } catch {
    return { ok: false, error: "رابط المزوّد غير صالح — مثال: https://api.openai.com/v1/chat/completions" };
  }
  const model = String(input.model ?? "").trim().slice(0, 200);
  if (!model) return { ok: false, error: "اسم الموديل مطلوب — زي ما المزوّد مسمّيه بالظبط" };

  const rawKeys = Array.isArray(input.apiKeys)
    ? input.apiKeys.map((k) => String(k ?? "").trim()).filter(Boolean)
    : String(input.apiKeys ?? "")
        .split(/[\n,;]+/)
        .map((k) => k.trim())
        .filter(Boolean);
  const apiKeys = [...new Set(rawKeys)].slice(0, 20);
  if (apiKeys.length === 0) return { ok: false, error: "لازم مفتاح API واحد على الأقل" };
  if (apiKeys.some((k) => k.length < 4 || k.length > 500)) {
    return { ok: false, error: "في مفتاح شكله غلط — راجع المفاتيح" };
  }

  let temperature = Number(input.temperature ?? 0.4);
  if (!Number.isFinite(temperature)) temperature = 0.4;
  temperature = Math.min(Math.max(temperature, 0), 2);

  let maxTokens = Math.floor(Number(input.maxTokens ?? 128000));
  if (!Number.isFinite(maxTokens) || maxTokens <= 0) maxTokens = 128000;
  maxTokens = Math.min(Math.max(maxTokens, 1000), 256000);

  return { ok: true, value: { name, baseUrl, model, apiKeys, temperature, maxTokens } };
}
