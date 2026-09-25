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
          password_hash TEXT NOT NULL,
          display_name TEXT NOT NULL,
          is_admin BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

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
          total_allocated_tokens BIGINT NOT NULL DEFAULT 500000,
          used_tokens BIGINT NOT NULL DEFAULT 0,
          quota_exhausted_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // سجل إجراءات لوحة الأدمن — بيستخدمه lib/adminGuard.ts (logAdminAction)
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
      await sql`CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC)`;

      // رصيد الـ API المنفصل (رصيد المطورين) — بيشتغل معاه lib/apiQuota.ts.
      // الافتراضي صفر: أي حساب جديد ميقدرش يكلم نقطة الـ API لحد ما الأدمن
      // يشحن رصيد فعلي، حتى لو نفس الحساب عنده رصيد شات طبيعي.
      await sql`
        CREATE TABLE IF NOT EXISTS user_api_quota (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          total_allocated_tokens BIGINT NOT NULL DEFAULT 0,
          used_tokens BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;

      // مفاتيح الـ API العامة — كل مفتاح مربوط بحساب وبيتخصم من رصيد الـ API
      await sql`
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          key_prefix TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          last_used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`;
    })();
  }
  return schemaReady;
}
