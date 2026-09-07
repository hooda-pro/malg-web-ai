import { NextRequest, NextResponse } from "next/server";
import { randomUUID, randomBytes, createHash } from "crypto";
import { sql, ensureSchema } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ensureUserApiQuota } from "@/lib/apiQuota";

export const dynamic = "force-dynamic";

/** لازم تتطابق مع الموديلات المتاحة في components/SettingsContext.tsx و lib/ai.ts */
const VALID_MODEL_IDS = new Set(["malg-2", "malg-2.1", "malg-2.2"]);
const MAX_LABEL_LENGTH = 60;
/** حد أقصى معقول لعدد المفاتيح النشطة لكل مستخدم — يمنع إنشاء مفاتيح بلا داعي */
const MAX_ACTIVE_KEYS_PER_USER = 20;

interface ApiKeyRowRaw {
  id: string;
  label: string;
  key_prefix: string;
  model_id: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

function serializeKey(row: ApiKeyRowRaw) {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.key_prefix,
    modelId: row.model_id,
    isActive: row.is_active,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

/** GET: كل مفاتيح المستخدم الحالي + رصيد الـ API بتاعه */
export async function GET() {
  const user = getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  await ensureSchema();
  await ensureUserApiQuota(user.id);

  const keyRows = (await sql`
    SELECT id, label, key_prefix, model_id, is_active, last_used_at, created_at
    FROM api_keys
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `) as ApiKeyRowRaw[];

  const quotaRows = (await sql`
    SELECT total_allocated_tokens, used_tokens
    FROM user_api_quota WHERE user_id = ${user.id}
  `) as { total_allocated_tokens: number; used_tokens: number }[];
  const quota = quotaRows[0];

  return NextResponse.json({
    keys: keyRows.map(serializeKey),
    quota: {
      totalAllocatedTokens: Number(quota?.total_allocated_tokens ?? 0),
      usedTokens: Number(quota?.used_tokens ?? 0),
    },
  });
}

/**
 * POST: إنشاء مفتاح API جديد مربوط بموديل محدد وقت الإنشاء.
 * المفتاح الكامل بيترجع في الرد مرة واحدة بس — بعد كده بيتخزن كـ hash فقط
 * ومفيش أي راوت هيرجعه تاني كامل.
 */
export async function POST(req: NextRequest) {
  const user = getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  await ensureSchema();

  const body = await req.json().catch(() => null);
  const modelId = String(body?.model_id || "");
  const rawLabel = typeof body?.label === "string" ? body.label.trim() : "";

  if (!VALID_MODEL_IDS.has(modelId)) {
    return NextResponse.json({ error: "الموديل غير معروف" }, { status: 400 });
  }

  const label = rawLabel ? rawLabel.slice(0, MAX_LABEL_LENGTH) : "مفتاح API";

  const countRows = (await sql`
    SELECT COUNT(*)::int AS c FROM api_keys WHERE user_id = ${user.id} AND is_active = TRUE
  `) as { c: number }[];
  if (Number(countRows[0]?.c ?? 0) >= MAX_ACTIVE_KEYS_PER_USER) {
    return NextResponse.json(
      {
        error: `وصلت للحد الأقصى لعدد المفاتيح النشطة (${MAX_ACTIVE_KEYS_PER_USER}) — ألغِ مفتاح قديم عشان تعمل واحد جديد`,
      },
      { status: 400 }
    );
  }

  // مفتاح عشوائي طويل (24 بايت = 48 حرف hex) — عشوائي بما يكفي إن SHA-256
  // العادي كفاية لتخزينه (مش محتاج bcrypt زي كلمة السر لأنه مش حاجة إنسان بيختارها)
  const fullKey = "malg-" + randomBytes(24).toString("hex");
  const keyHash = createHash("sha256").update(fullKey).digest("hex");
  const keyPrefix = fullKey.slice(0, 12);
  const id = randomUUID();

  await sql`
    INSERT INTO api_keys (id, user_id, label, key_prefix, key_hash, model_id)
    VALUES (${id}, ${user.id}, ${label}, ${keyPrefix}, ${keyHash}, ${modelId})
  `;

  await ensureUserApiQuota(user.id);

  return NextResponse.json({
    key: serializeKey({
      id,
      label,
      key_prefix: keyPrefix,
      model_id: modelId,
      is_active: true,
      last_used_at: null,
      created_at: new Date().toISOString(),
    }),
    // المرة الوحيدة اللي المفتاح الكامل هيتعرض فيها — الواجهة لازم تعرضه
    // للمستخدم وتحذّره إنه مش هيتعرض تاني.
    fullKey,
  });
}
