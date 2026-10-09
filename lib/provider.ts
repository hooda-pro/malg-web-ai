import { sql } from "./db";

/**
 * إعدادات مزوّد الموديل النشط — الأدمن بيغيّرها من لوحة الإدارة
 * من غير ما يمس الكود أو متغيرات البيئة.
 *
 * الأولوية: صف `provider_settings` النشط في الداتابيز، ولو مفيش
 * بنرجع لإعدادات البيئة القديمة (Token Harbor) كـ fallback.
 *
 * النظام Protocol-agnostic: كل مزوّد ليه protocol صريح
 * (chat_completions أو responses)، والـ endpoint بيتحل حسب البروتوكول
 * عن طريق resolveProviderEndpoint — مش بفرض /chat/completions على الكل.
 */

/** بروتوكولات الـ API المدعومة — مصممة للتوسع بدون إعادة بناء */
export type ProviderProtocol = "chat_completions" | "responses";

export const PROVIDER_PROTOCOLS: ProviderProtocol[] = ["chat_completions", "responses"];

/** طبقة الموديل: مجاني للكل، أم مدفوع (مشتركو Pro فقط) — يحددها الأدمن */
export type ModelTier = "free" | "paid";

export const PROTOCOL_LABELS: Record<ProviderProtocol, string> = {
  chat_completions: "Chat Completions",
  responses: "Responses API",
};

export function isProviderProtocol(v: unknown): v is ProviderProtocol {
  return v === "chat_completions" || v === "responses";
}

/** يستنتج البروتوكول من الرابط لو الأدمن ماحددش — آمن ومحافظ */
export function inferProtocolFromUrl(url: string): ProviderProtocol {
  const t = String(url ?? "").toLowerCase();
  if (/\/responses\/?(\?.*)?$/.test(t)) return "responses";
  return "chat_completions";
}

export interface ProviderConfig {
  id: string;
  name: string;
  /**
   * الـ Base URL كما أدخله الأدمن (منظّف فقط — بدون فرض أي مسار).
   * الـ endpoint النهائي بيتحل عبر resolveProviderEndpoint حسب البروتوكول.
   * قيم قديمة مخزنة قد تحتوي المسار الكامل (/v1/chat/completions) —
   * resolveProviderEndpoint بيتعامل معها للتوافق الخلفي.
   */
  baseUrl: string;
  protocol: ProviderProtocol;
  /** اسم الموديل زي ما المزوّد مسمّيه (مثال: deepseek-v4.1-flash:free) */
  model: string;
  /** المفاتيح الخام — موجودة على السيرفر بس، عمرها ما بتتبعت للواجهة */
  apiKeys: string[];
  temperature: number;
  maxTokens: number;
  tier: ModelTier;
  isActive: boolean;
  updatedAt: string | null;
}

/** نفس الشكل بس بالمفتاح متخفي — ده اللي بيروح للواجهة */
export interface ProviderConfigPublic extends Omit<ProviderConfig, "apiKeys"> {
  maskedKeys: string[];
  keysCount: number;
}

// ---------------------------------------------------------------------------
// الموديلات المتعددة: كل موديل (id ظاهر للمستخدم) مربوط بإعداد مزوّد كامل خاص بيه
// ---------------------------------------------------------------------------

/** ملخص موديل للقوائم (عام — بدون مفاتيح خام) */
export interface ModelSummary {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  isActive: boolean;
  keysCount: number;
  updatedAt: string | null;
  tier: ModelTier;
}

/** إعداد مزوّد مربوط بموديل معين — اللي بيستخدمه التفاوض الفعلي */
export interface ModelProviderConfig extends ProviderConfig {
  /** id صف ai_models (slug ظاهر للمستخدم) */
  modelId: string;
  /** الاسم المعروض للموديل (ai_models.name) — للهوية في system prompt */
  displayName: string;
  /** هل ده الموديل الافتراضي */
  isDefault: boolean;
}

export interface ModelRow {
  id: string;
  name: string;
  description: unknown;
  base_url: string;
  protocol: unknown;
  model: string;
  api_keys: string[];
  temperature: unknown;
  max_tokens: unknown;
  tier: unknown;
  is_active: boolean;
  is_default: unknown;
  updated_at: string | null;
}

/** تحويل slug الموديل لصيغة آمنة: حروف صغيرة وأرقام و- و_ فقط */
export function sanitizeModelId(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "")
    .slice(0, 64);
}

/** توليد slug من اسم العرض (لو الأدمن مدخلش id صريح) */
export function slugifyModelName(name: string): string {
  const slug = sanitizeModelId(name).replace(/^[-_]+|[-_]+$/g, "");
  return slug;
}

export interface ModelInput {
  id?: unknown;
  name?: unknown;
  description?: unknown;
}

export type ModelValidation =
  | { ok: true; value: { id: string; name: string; description: string } }
  | { ok: false; error: string };

export function validateModelInput(input: ModelInput): ModelValidation {
  const name = String(input.name ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "اسم الموديل مطلوب" };
  let id = sanitizeModelId(input.id ?? "");
  if (!id) id = slugifyModelName(name);
  if (!id || id.length < 2) return { ok: false, error: "تعذر اشتقاق معرف صالح من الاسم — اكتب id يدويًا (حروف إنجليزية وأرقام و- و_)" };
  const description = String(input.description ?? "").trim().slice(0, 500);
  return { ok: true, value: { id, name, description } };
}

function modelRowToConfig(r: ModelRow): ModelProviderConfig {
  const base = rowToConfig({
    id: r.id,
    name: r.name,
    base_url: r.base_url,
    model: r.model,
    api_keys: r.api_keys,
    temperature: r.temperature,
    max_tokens: r.max_tokens,
    is_active: r.is_active,
    updated_at: r.updated_at,
    protocol: r.protocol,
    tier: r.tier,
  });
  return {
    ...base,
    modelId: r.id,
    displayName: r.name,
    isDefault: r.is_default === true,
  };
}

function modelRowToSummary(r: ModelRow): ModelSummary {
  const keys = Array.isArray(r.api_keys) ? r.api_keys.filter((k) => typeof k === "string" && k.trim()) : [];
  return {
    id: r.id,
    name: r.name,
    description: typeof r.description === "string" ? r.description : "",
    isDefault: r.is_default === true,
    isActive: !!r.is_active,
    keysCount: keys.length,
    updatedAt: r.updated_at ?? null,
    tier: (r as { tier?: unknown }).tier === "paid" ? "paid" : "free",
  };
}

/** كاش لكل موديل على حدة (نفس فكرة الكاش القديم) */
const modelCache = new Map<string, { config: ModelProviderConfig; at: number }>();

export function invalidateModelCache(modelId?: string) {
  if (modelId) modelCache.delete(modelId);
  else modelCache.clear();
}

async function selectModelRows(whereActive: boolean): Promise<ModelRow[]> {
  if (whereActive) {
    return (await sql`
      SELECT id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default, updated_at, tier
      FROM ai_models
      WHERE is_active = TRUE
      ORDER BY is_default DESC, sort_order ASC, created_at ASC
    `) as ModelRow[];
  }
  return (await sql`
    SELECT id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default, updated_at, tier
    FROM ai_models
    ORDER BY is_default DESC, sort_order ASC, created_at ASC
  `) as ModelRow[];
}

/** كل الموديلات (للأدمن: الكل، للواجهة: النشطة فقط) — فارغ لو الجدول لسه متعملش */
export async function listModels(activeOnly = false): Promise<ModelSummary[]> {
  try {
    const rows = await selectModelRows(activeOnly);
    return rows.map(modelRowToSummary);
  } catch {
    return [];
  }
}

/** id الموديل الافتراضي النشط — أو أول موديل نشط — أو 'malg-a3' كحل أخير */
export async function getDefaultModelId(): Promise<string> {
  try {
    const rows = (await sql`
      SELECT id FROM ai_models
      WHERE is_active = TRUE
      ORDER BY is_default DESC, sort_order ASC, created_at ASC
      LIMIT 1
    `) as { id: string }[];
    if (rows[0]?.id) return rows[0].id;
  } catch {
    // الجدول لسه متعملش — نكمل للـ fallback
  }
  return "malg-a3";
}

/**
 * مزوّد موديل معين بالـ slug — مع fallback متدرج:
 * 1) صف ai_models نشط بنفس الـ id
 * 2) الموديل الافتراضي النشط
 * 3) المسار القديم (provider_settings/env) ملفوفًا كهوية الموديل المطلوب
 */
export async function getModelProvider(modelId: string): Promise<ModelProviderConfig> {
  const id = sanitizeModelId(modelId) || "malg-a3";
  const cached = modelCache.get(id);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.config;

  const wrapLegacy = (cfg: ProviderConfig): ModelProviderConfig => ({
    ...cfg,
    modelId: id,
    displayName: "Malg-A3",
    isDefault: id === "malg-a3",
  });

  try {
    const rows = (await sql`
      SELECT id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default, updated_at, tier
      FROM ai_models
      WHERE id = ${id} AND is_active = TRUE
      LIMIT 1
    `) as ModelRow[];
    if (rows[0]) {
      const config = modelRowToConfig(rows[0]);
      modelCache.set(id, { config, at: Date.now() });
      return config;
    }
    // fallback: الموديل الافتراضي النشط
    const defs = (await sql`
      SELECT id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default, updated_at, tier
      FROM ai_models
      WHERE is_active = TRUE
      ORDER BY is_default DESC, sort_order ASC, created_at ASC
      LIMIT 1
    `) as ModelRow[];
    if (defs[0]) {
      const config = modelRowToConfig(defs[0]);
      modelCache.set(id, { config, at: Date.now() });
      return config;
    }
  } catch {
    // الجدول لسه متعملش — نكمل للمسار القديم
  }
  const legacy = await getActiveProvider();
  const config = wrapLegacy(legacy);
  modelCache.set(id, { config, at: Date.now() });
  return config;
}

/** آخر إعداد محفوظ لموديل معين حتى لو مش نشط — للعرض في لوحة الأدمن */
export async function getSavedModelProvider(modelId: string): Promise<ModelProviderConfig | null> {
  const id = sanitizeModelId(modelId) || "malg-a3";
  try {
    const rows = (await sql`
      SELECT id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default, updated_at, tier
      FROM ai_models
      WHERE id = ${id}
      LIMIT 1
    `) as ModelRow[];
    return rows[0] ? modelRowToConfig(rows[0]) : null;
  } catch {
    return null;
  }
}

const FALLBACK_BASE_URL = "https://tokenharbor.ai/v1/chat/completions";
const FALLBACK_MODEL = "deepseek-v4.1-flash:free";
const FALLBACK_PROTOCOL: ProviderProtocol = "chat_completions";

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

function envProtocol(): ProviderProtocol {
  const raw = (process.env.PROVIDER_PROTOCOL || process.env.PROVIDER_API_PROTOCOL || "").trim().toLowerCase();
  if (isProviderProtocol(raw)) return raw;
  const base = process.env.PROVIDER_BASE_URL?.trim() || FALLBACK_BASE_URL;
  return inferProtocolFromUrl(base);
}

function envFallback(): ProviderConfig {
  const base = process.env.PROVIDER_BASE_URL?.trim() || FALLBACK_BASE_URL;
  return {
    id: "env-fallback",
    name: "Token Harbor (من متغيرات البيئة)",
    baseUrl: cleanBaseUrl(base) || FALLBACK_BASE_URL,
    protocol: envProtocol(),
    model: process.env.PROVIDER_MODEL?.trim() || FALLBACK_MODEL,
    apiKeys: envKeys(),
    temperature: 0.4,
    maxTokens: 128000,
    tier: "free",
    isActive: true,
    updatedAt: null,
  };
}

/** كاش قصير في الذاكرة عشان كل رسالة شات متعملش استعلام زيادة */
let cache: { config: ProviderConfig; at: number } | null = null;
const CACHE_MS = 15_000;

export function invalidateProviderCache() {
  cache = null;
  modelCache.clear();
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
  protocol?: unknown;
  tier?: unknown;
}

export function rowToConfig(r: ProviderRow): ProviderConfig {
  const rawProto = typeof r.protocol === "string" ? r.protocol.trim().toLowerCase() : "";
  const protocol: ProviderProtocol = isProviderProtocol(rawProto)
    ? rawProto
    : inferProtocolFromUrl(String(r.base_url ?? ""));
  return {
    id: r.id,
    name: r.name,
    baseUrl: String(r.base_url ?? ""),
    protocol,
    tier: r.tier === "paid" ? "paid" : "free",
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
 * اللي بيتغيّر بس: البروتوكول + الرابط + الموديل + المفتاح.
 */
export async function getActiveProvider(): Promise<ProviderConfig> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.config;
  // نحاول قراءة عمود protocol الجديد — لو قاعدة قديمة لسه ماعملتش migration
  // بنرجع للاستعلام القديم ونستنتج البروتوكول من الرابط.
  try {
    try {
      const rows = (await sql`
        SELECT id, name, base_url, model, api_keys, temperature, max_tokens, is_active, updated_at, protocol
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/protocol/i.test(msg)) throw e;
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
    try {
      const rows = (await sql`
        SELECT id, name, base_url, model, api_keys, temperature, max_tokens, is_active, updated_at, protocol
        FROM provider_settings
        ORDER BY updated_at DESC
        LIMIT 1
      `) as ProviderRow[];
      return rows[0] ? rowToConfig(rows[0]) : null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/protocol/i.test(msg)) throw e;
      const rows = (await sql`
        SELECT id, name, base_url, model, api_keys, temperature, max_tokens, is_active, updated_at
        FROM provider_settings
        ORDER BY updated_at DESC
        LIMIT 1
      `) as ProviderRow[];
      return rows[0] ? rowToConfig(rows[0]) : null;
    }
  } catch {
    return null;
  }
}

/**
 * تنظيف أساسي للرابط — يشيل المسافات والسلاشات الزيادة ويضيف https لو ناقص.
 * لا يفرض أي مسار (/chat/completions أو /responses) — الـ endpoint النهائي
 * بيتحل عبر resolveProviderEndpoint حسب البروتوكول.
 */
export function cleanBaseUrl(input: string): string {
  const t = String(input ?? "").trim().replace(/\/+$/, "");
  if (!t) return "";
  if (!/^https?:\/\//i.test(t)) return `https://${t}`.replace(/\/+$/, "");
  return t;
}

/**
 * تطبيع رابط المزوّد — يقبل الدومين لوحده أو المسار الكامل.
 *
 * سلوك جديد (متوافق خلفيًا): ينظّف فقط ولا يفرض مسارًا.
 * الباراميتر الثاني (protocol) اختياري ومحفوظ للتوافق مع النداءات القديمة —
 * لا يؤثر على التنظيف نفسه، لأن الحل النهائي يتم في resolveProviderEndpoint.
 */
export function normalizeBaseUrl(input: string, _protocol?: ProviderProtocol | string): string {
  void _protocol;
  return cleanBaseUrl(input);
}

/**
 * حل الـ endpoint النهائي حسب البروتوكول — من الـ base المخزّن.
 *
 * - chat_completions: ينتهي بـ /chat/completions
 * - responses: ينتهي بـ /responses
 *
 * يتعامل مع كل الأشكال:
 * - مسار كامل قديم (…/v1/chat/completions) → يُستخدم كما هو (chat) أو يُستبدل (responses)
 * - جذر ينتهي بـ /v1 → يُضاف المسار المناسب
 * - دومين bare أو prefix مخصص (…/inference/openai) → يُبنى المسار المناسب
 */
export function resolveProviderEndpoint(baseUrl: string, protocol: ProviderProtocol): string {
  const b = cleanBaseUrl(baseUrl);
  if (!b) return "";
  const proto: ProviderProtocol = isProviderProtocol(protocol) ? protocol : "chat_completions";

  if (proto === "responses") {
    if (/\/responses\/?(\?.*)?$/i.test(b)) return b;
    if (/\/chat\/completions\/?(\?.*)?$/i.test(b)) {
      return b.replace(/\/chat\/completions\/?(\?.*)?$/i, "/responses");
    }
    if (/\/v1\/?(\?.*)?$/i.test(b)) return `${b}/responses`;
    // قاعدة تحتوي /v1 في المنتصف (مثال: …/inference/openai/v1/custom؟ لا —
    // لو فيها /v1/ فعلًا نضيف /responses فقط بدل تكرار v1)
    if (/\/v1\//i.test(b)) return `${b}/responses`.replace(/\/+/g, "/").replace(":/", "://");
    return `${b}/v1/responses`;
  }

  // chat_completions
  if (/\/chat\/completions\/?(\?.*)?$/i.test(b)) return b;
  if (/\/responses\/?(\?.*)?$/i.test(b)) {
    return b.replace(/\/responses\/?(\?.*)?$/i, "/chat/completions");
  }
  if (/\/v1\/?(\?.*)?$/i.test(b)) return `${b}/chat/completions`;
  if (/\/v1\//i.test(b)) return `${b}/chat/completions`.replace(/([^:])\/+/g, "$1/");
  return `${b}/v1/chat/completions`;
}

export interface ProviderInput {
  name?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKeys?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  protocol?: unknown;
  /** أسماء بديلة مقبولة من الواجهة */
  apiProtocol?: unknown;
  api_protocol?: unknown;
}

export type ProviderValidation =
  | { ok: true; value: { name: string; baseUrl: string; protocol: ProviderProtocol; model: string; apiKeys: string[]; temperature: number; maxTokens: number } }
  | { ok: false; error: string };

function parseProtocolInput(input: ProviderInput, baseUrlRaw: string): ProviderProtocol {
  const candidates = [input.protocol, input.apiProtocol, input.api_protocol];
  for (const c of candidates) {
    if (typeof c === "string") {
      const t = c.trim().toLowerCase();
      // أسماء ودية من الواجهة
      if (t === "responses" || t === "responses_api" || t === "responses-api" || t === "openai-responses") return "responses";
      if (t === "chat" || t === "chat_completions" || t === "chat-completions" || t === "chat-completion" || t === "openai-chat") return "chat_completions";
      if (isProviderProtocol(t)) return t;
    }
  }
  // لو الأدمن ماحددش: استنتاج آمن من الرابط (ينتهي بـ /responses → responses)
  return inferProtocolFromUrl(baseUrlRaw);
}

export function validateProviderInput(input: ProviderInput): ProviderValidation {
  const name = String(input.name ?? "").trim().slice(0, 80) || "مزود مخصص";
  const rawBase = String(input.baseUrl ?? "");
  const protocol = parseProtocolInput(input, rawBase);
  const baseUrl = normalizeBaseUrl(rawBase, protocol);
  if (!baseUrl) return { ok: false, error: "رابط المزوّد (Base URL) مطلوب" };
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad");
  } catch {
    return { ok: false, error: "رابط المزوّد غير صالح — مثال: https://api.openai.com/v1" };
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

  return { ok: true, value: { name, baseUrl, protocol, model, apiKeys, temperature, maxTokens } };
}
