import { createHash, randomBytes, randomUUID } from "crypto";
import { sql } from "./db";

/**
 * مفاتيح الـ API العامة.
 *
 * الأمان: بنخزّن SHA-256 hash للمفتاح مش المفتاح نفسه — يعني لو الـ DB
 * اتسرّب مفيش حدا يقدر يستخدم المفاتيح. المفتاح الأصلي بيتعرض مرة واحدة
 * بس وقت الإنشاء، وبعدها مش بيتخزن في أي مكان تاني.
 * البادئة (key_prefix) بتتخزن عشان الواجهة تعرف تميّز المفاتيح.
 */

const KEY_PREFIX = "mlag";
/** طول البصمة عشان الـ hash يبقى قوي كفاية. */
const SECRET_BYTES = 32;

export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

function hashKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function buildPlainKey(): { plain: string; prefix: string; hash: string } {
  const secret = randomBytes(SECRET_BYTES).toString("base64url");
  const plain = `${KEY_PREFIX}_sk_${secret}`;
  return { plain, prefix: plain.slice(0, 16), hash: hashKey(plain) };
}

/** ينشئ مفتاح جديد. المفتاح原文 بيرجع مرة واحدة هنا وخلاص. */
export async function createApiKey(
  userId: string,
  name: string
): Promise<{ record: ApiKeyRecord; plainKey: string }> {
  const { plain, prefix, hash } = buildPlainKey();
  const id = randomUUID();

  const rows = await sql`
    INSERT INTO api_keys (id, user_id, name, key_hash, key_prefix)
    VALUES (${id}, ${userId}, ${name}, ${hash}, ${prefix})
    RETURNING id, user_id, name, key_prefix, is_active, last_used_at, created_at
  `;
  const r = rows[0] as Record<string, unknown>;
  return {
    plainKey: plain,
    record: {
      id: String(r.id),
      userId: String(r.user_id),
      name: String(r.name),
      keyPrefix: String(r.key_prefix),
      isActive: Boolean(r.is_active),
      lastUsedAt: r.last_used_at ? new Date(String(r.last_used_at)).toISOString() : null,
      createdAt: new Date(String(r.created_at)).toISOString(),
    },
  };
}

function toRecord(r: Record<string, unknown>): ApiKeyRecord {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    name: String(r.name),
    keyPrefix: String(r.key_prefix),
    isActive: Boolean(r.is_active),
    lastUsedAt: r.last_used_at ? new Date(String(r.last_used_at)).toISOString() : null,
    createdAt: new Date(String(r.created_at)).toISOString(),
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const rows = await sql`
    SELECT id, user_id, name, key_prefix, is_active, last_used_at, created_at
    FROM api_keys WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return rows.map((r) => toRecord(r as Record<string, unknown>));
}

export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE api_keys SET is_active = FALSE
    WHERE id = ${keyId} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * بيتحقق من مفتاح جاي من الـ header Authorization ويرجّع صاحب المفتاح.
 * بيحدّث last_used_at بس (far away من مسار الطلب عشان مايعطّلهاش).
 */
export async function verifyApiKey(
  plainKey: string
): Promise<{ userId: string; keyId: string } | null> {
  if (!plainKey || plainKey.length < 20) return null;
  const hash = hashKey(plainKey);

  const rows = await sql`
    SELECT id, user_id FROM api_keys
    WHERE key_hash = ${hash} AND is_active = TRUE
    LIMIT 1
  `;
  const r = rows[0] as { id: string; user_id: string } | undefined;
  if (!r) return null;

  // تحديث آخر استخدام — الاختفاء عن النتيجة مقصود (مش مهم ننتظره)
  void sql`UPDATE api_keys SET last_used_at = now() WHERE id = ${r.id}`.catch(() => undefined);

  return { userId: r.user_id, keyId: r.id };
}

/** بيطلّع المفتاح من هيدر Authorization بصيغته القياسية. */
export function extractBearer(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}