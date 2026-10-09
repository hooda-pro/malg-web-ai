import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// مهم: ما بنعملش neon(...) على مستوى الملف مباشرة، عشان Next.js بيستورد
// الملف ده وقت الـ build (خطوة "Collecting page data") حتى لو الراوت
// نفسه مش بيتنفذ — ولو DATABASE_URL مش متاح في اللحظة دي، هيوقع الـ build
// كله. بدل كده بنأجل إنشاء الاتصال لحد أول استعلام فعلي وقت الطلب (runtime).
let _sql: NeonQueryFunction<false, false> | null = null;

function getClient(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const connectionString = process.env.DATABASE_URL || "";
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL مش متضبط في متغيرات البيئة — ضيفه في Vercel Project Settings > Environment Variables (رابط الاتصال من Neon) وأعد النشر."
      );
    }
    _sql = neon(connectionString);
  }
  return _sql;
}

// نفس شكل الاستخدام القديم: sql`SELECT ...` — لكن الاتصال الحقيقي
// بيتعمل بس أول مرة تتنفذ فيها الدالة دي فعليًا.
export const sql: NeonQueryFunction<false, false> = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  getClient()(strings, ...values)) as unknown as NeonQueryFunction<false, false>;

let schemaReady: Promise<void> | null = null;

/**
 * بيتأكد إن فيه حساب أدمن واحد على الأقل في القاعدة — لو مفيش، بينشئ الحساب الافتراضي.
 * الإيميل والباسورد بيتظبطوا من متغيرات البيئة ADMIN_EMAIL و ADMIN_PASSWORD
 * (لو مش موجودين، مفيش حساب أدمن هيتعمل تلقائيًا — لازم تظبطهم في Vercel).
 */
async function seedDefaultAdmin() {
  try {
    const existing = await sql`SELECT id FROM users WHERE is_admin = TRUE LIMIT 1`;
    if (existing.length > 0) return;

    const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "";

    if (!email || !password) {
      console.error(
        "[seed] ADMIN_EMAIL و/أو ADMIN_PASSWORD مش متظبطين في متغيرات البيئة — " +
          "مفيش حساب أدمن هيتعمل تلقائيًا لأسباب أمنية. ضيفهم في Vercel Project " +
          "Settings > Environment Variables (باسورد قوي وطويل) وأعد النشر."
      );
      return;
    }
    if (password.length < 12) {
      console.error(
        "[seed] ADMIN_PASSWORD قصير جدًا (أقل من 12 حرف) — اختار باسورد أقوى وأعد النشر. مفيش حساب أدمن هيتعمل دلوقتي."
      );
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = randomUUID();

    await sql`
      INSERT INTO users (id, email, password_hash, display_name, is_admin, profile_complete)
      VALUES (${id}, ${email}, ${passwordHash}, 'Admin', TRUE, TRUE)
      ON CONFLICT (email) DO UPDATE SET is_admin = TRUE
    `;
    await sql`
      INSERT INTO user_quota (user_id, total_allocated_tokens, used_tokens)
      VALUES (${id}, 99000000, 0)
      ON CONFLICT (user_id) DO NOTHING
    `;
    console.log(`[seed] تم إنشاء حساب الأدمن الافتراضي: ${email}`);
  } catch (e) {
    console.error("seedDefaultAdmin error", e);
  }
}

/**
 * يضمن وجود موديل افتراضي واحد على الأقل في ai_models.
 * - لو الجدول فاضي وفيه إعداد قديم في provider_settings → يرحّله كموديل 'malg-a3' افتراضي.
 * - لو مفيش حاجة خالص → يزرع موديل افتراضي من متغيرات البيئة (نفس قيم الـ fallback).
 * Idempotent: لا يفعل شيئًا لو الجدول فيه صفوف.
 */
async function seedDefaultModel() {
  try {
    const existing = await sql`SELECT id FROM ai_models LIMIT 1`;
    if (existing.length > 0) return;

    // ترحيل آخر إعداد نشط قديم (لو موجود) — بنفس المفاتيح والإعدادات
    try {
      const migrated = await sql`
        INSERT INTO ai_models (id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default)
        SELECT 'malg-a3', COALESCE(name, 'Malg-A3'), '', base_url, COALESCE(protocol, 'chat_completions'), model, api_keys, temperature, max_tokens, TRUE, TRUE
        FROM provider_settings
        WHERE is_active = TRUE
        ORDER BY updated_at DESC
        LIMIT 1
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (migrated.length > 0) {
        console.log("[seed] تم ترحيل إعداد المزوّد القديم إلى موديل malg-a3 الافتراضي");
        return;
      }
    } catch (e) {
      console.error("seedDefaultModel: تعذر الترحيل من provider_settings", e);
    }

    // لا يوجد أي إعداد قديم — ازرع موديل افتراضي من البيئة (نفس قيم الـ fallback)
    const baseUrl = (process.env.PROVIDER_BASE_URL || "").trim() || "https://tokenharbor.ai/v1/chat/completions";
    const model = (process.env.PROVIDER_MODEL || "").trim() || "deepseek-v4.1-flash:free";
    const keys = [];
    const numberedPattern = /^TOKENHARBOR_API_KEYS?_?(\d+)$/i;
    const numbered = Object.keys(process.env)
      .map((name) => {
        const m = name.match(numberedPattern);
        return m ? { name, index: parseInt(m[1], 10) } : null;
      })
      .filter((x) => x !== null)
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
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const fullBase = /^https?:\/\//i.test(cleanBase) ? cleanBase : `https://${cleanBase}`;
    await sql`
      INSERT INTO ai_models (id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, is_active, is_default)
      VALUES ('malg-a3', 'Malg-A3', '', ${fullBase}, 'chat_completions', ${model}, ${[...new Set(keys)]}, 0.4, 128000, TRUE, TRUE)
      ON CONFLICT (id) DO NOTHING
    `;
    console.log("[seed] تم إنشاء الموديل الافتراضي malg-a3");
  } catch (e) {
    console.error("seedDefaultModel error", e);
  }
}

/**
 * يزرع موديل Claude Sonnet 5.5 (عبر Token Harbor — نفس baseURL ومفاتيح malg-a3):
 * - مدفوع (Pro فقط) + معامل تكلفة ×4.
 * - ON CONFLICT DO NOTHING: آمن على القواعد الموجودة، والأدمن يفعّله من اللوحة.
 * ملحوظة: لو غيّرت مفاتيح malg-a3 بعد البذر، انسخها لصف كلود يدويًا من اللوحة.
 */
async function seedClaudeModel() {
  try {
    await sql`
      INSERT INTO ai_models (id, name, description, base_url, protocol, model, api_keys, temperature, max_tokens, tier, cost_multiplier, is_active, is_default)
      SELECT 'claude-sonnet-5-5', 'Claude Sonnet 5.5', 'الأحدث من Anthropic — برمجة ووكلاء (يتطلب Pro).', COALESCE((SELECT base_url FROM ai_models WHERE id = 'malg-a3' LIMIT 1), 'https://tokenharbor.ai/v1/chat/completions'), 'chat_completions', 'claude-sonnet-5.5', COALESCE((SELECT api_keys FROM ai_models WHERE id = 'malg-a3' LIMIT 1), '{}'::text[]), 0.4, 128000, 'paid', 4, FALSE, FALSE
      WHERE NOT EXISTS (SELECT 1 FROM ai_models WHERE id = 'claude-sonnet-5-5')
    `;
  } catch (e) {
    console.error("seedClaudeModel error", e);
  }
}

/**
 * ينشئ الجداول لو مش موجودة (idempotent). بتتكرر النتيجة بأمان.
 * بتتنفذ مرة واحدة لكل نسخة سيرفر شغالة (cold start) بفضل الـ promise cache.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          display_name TEXT NOT NULL,
          is_admin BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // ——— تسجيل الدخول بجوجل (Firebase Auth): مفيش باسورد للحسابات دي ———
      await sql`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS age INTEGER`;
      // الحسابات القديمة (بريد/باسورد، زي الأدمن) تعتبر بياناتها مكتملة افتراضيًا
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN NOT NULL DEFAULT TRUE`;

      await sql`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT 'محادثة جديدة',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_sessions_user ON chat_sessions(user_id)`;

      // ——— إنهاء المحادثة (زي Claude): تحذيرات محترمة الأول، وبعدين قفل نهائي للشات ———
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS abuse_warnings INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`;
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS ended_reason TEXT`;
      // مين قفل: 'abuse' (سلوك مسيء بعد تحذير) أو 'user' (المستخدم طلب وأكّد)
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS ended_by TEXT`;
      // الموديل سأل المستخدم عن تأكيد قفل الشات في رده الأخير وبيستنى الإجابة (صالح لرسالة واحدة)
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS close_pending BOOLEAN NOT NULL DEFAULT FALSE`;

      await sql`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          reasoning TEXT,
          thinking_duration_ms BIGINT,
          is_truncated BOOLEAN NOT NULL DEFAULT FALSE,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_messages_session ON chat_messages(session_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS user_quota (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          total_allocated_tokens BIGINT NOT NULL DEFAULT 100000,
          used_tokens BIGINT NOT NULL DEFAULT 0,
          quota_exhausted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // حجز «رد واحد شغال في نفس الوقت» لكل مستخدم (lib/usageGuard.ts)
      await sql`ALTER TABLE user_quota ADD COLUMN IF NOT EXISTS busy_until TIMESTAMPTZ`;
      await sql`ALTER TABLE user_quota ADD COLUMN IF NOT EXISTS busy_token TEXT`;
      // فهرس لحساب حد الرسايل في الدقيقة/الساعة بسرعة
      await sql`CREATE INDEX IF NOT EXISTS idx_messages_created ON chat_messages(created_at)`;

      // ——— الأدمن: أعمدة الحظر + سجل الإجراءات ———
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ`;

      await sql`
        CREATE TABLE IF NOT EXISTS admin_logs (
          id TEXT PRIMARY KEY,
          admin_id TEXT NOT NULL,
          admin_email TEXT NOT NULL,
          action TEXT NOT NULL,
          target_user_id TEXT,
          target_email TEXT,
          details TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // ——— API للمطورين: مفاتيح API + رصيد منفصل تمامًا عن رصيد الشات + لوج استخدام ———
      await sql`
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          label TEXT NOT NULL DEFAULT 'مفتاح API',
          key_prefix TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          model_id TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          last_used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`;

      await sql`
        CREATE TABLE IF NOT EXISTS user_api_quota (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          total_allocated_tokens BIGINT NOT NULL DEFAULT 0,
          used_tokens BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE TABLE IF NOT EXISTS api_usage_logs (
          id TEXT PRIMARY KEY,
          api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          tokens_used INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_api_usage_user ON api_usage_logs(user_id)`;

      // ——— Rate limiting مشترك بين كل نسخ السيرفر (lib/rateLimit.ts → checkRateLimitShared) ———
      await sql`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
          blocked_until TIMESTAMPTZ
        )
      `;

      // ——— إعداد مزوّد الموديل النشط (lib/provider.ts) — الأدمن بيغيّره من لوحة الإدارة ———
      await sql`
        CREATE TABLE IF NOT EXISTS provider_settings (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL DEFAULT 'مزود مخصص',
          base_url TEXT NOT NULL,
          model TEXT NOT NULL,
          api_keys TEXT[] NOT NULL DEFAULT '{}',
          temperature DOUBLE PRECISION NOT NULL DEFAULT 0.4,
          max_tokens INTEGER NOT NULL DEFAULT 128000,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      // بروتوكول المزوّد (chat_completions / responses) — يُضاف للقواعد القديمة بأمان
      await sql`ALTER TABLE provider_settings ADD COLUMN IF NOT EXISTS protocol TEXT NOT NULL DEFAULT 'chat_completions'`;

      // ——— الموديلات المتعددة: كل موديل (يظهر للمستخدم) ليه إعداد مزوّد كامل خاص بيه ———
      await sql`
        CREATE TABLE IF NOT EXISTS ai_models (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          base_url TEXT NOT NULL,
          protocol TEXT NOT NULL DEFAULT 'chat_completions',
          model TEXT NOT NULL,
          api_keys TEXT[] NOT NULL DEFAULT '{}',
          temperature DOUBLE PRECISION NOT NULL DEFAULT 0.4,
          max_tokens INTEGER NOT NULL DEFAULT 128000,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'`;

      // ——— اشتراكات الباقات (شهري/سنوي): تفعيل يدوي بواسطة الأدمن بعد تأكيد الدفع ———
      await sql`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          plan_id TEXT NOT NULL,
          period TEXT NOT NULL DEFAULT 'monthly',
          status TEXT NOT NULL DEFAULT 'active',
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          ends_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_subs_user ON user_subscriptions(user_id)`;

      // --- Memory: one small row per user ---
      await sql`
        CREATE TABLE IF NOT EXISTS user_memory (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          summary TEXT NOT NULL DEFAULT '',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`ALTER TABLE ai_models ADD COLUMN IF NOT EXISTS cost_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1`;

      await seedDefaultModel();
      await seedClaudeModel();

      // ——— تثبيت المحادثات + المؤقتة + المشاركة برابط (تفاعلات المستخدم) ———
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS is_temp BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS share_token TEXT`;
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_share_token ON chat_sessions(share_token) WHERE share_token IS NOT NULL`;

      // ——— تقييم الردود (👍👎) ———
      await sql`
        CREATE TABLE IF NOT EXISTS message_feedback (
          message_id TEXT PRIMARY KEY REFERENCES chat_messages(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          rating SMALLINT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // ——— إعدادات عامة key/value (البحث وغيره) — الأدمن بيغيّرها من لوحة الإدارة ———
      await sql`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}',
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // إنشاء حساب الأدمن الافتراضي لو مفيش أي أدمن في القاعدة
      await seedDefaultAdmin();
    })().catch((e) => {
      // لو التهيئة فشلت (مثلاً انقطاع لحظي في الاتصال) ما نسيبش الـ promise الفاشل متخزّن:
      // من غير السطر ده كل طلب بعد كده على نفس النسخة كان بياخد نفس الخطأ لحد ما تتعمل إعادة تشغيل.
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}
