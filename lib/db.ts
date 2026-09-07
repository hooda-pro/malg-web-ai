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
 * (لو مش موجودين بيستخدم القيم الافتراضية اللي تحت).
 */
async function seedDefaultAdmin() {
  try {
    const existing = await sql`SELECT id FROM users WHERE is_admin = TRUE LIMIT 1`;
    if (existing.length > 0) return;

    const email = (process.env.ADMIN_EMAIL || "admin@mlag.ai").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "Mlag@Admin2026";
    const passwordHash = await bcrypt.hash(password, 10);
    const id = randomUUID();

    await sql`
      INSERT INTO users (id, email, password_hash, display_name, is_admin)
      VALUES (${id}, ${email}, ${passwordHash}, 'Admin', TRUE)
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
      // الحسابات القديمة (بريد/باسورد) تعتبر بياناتها مكتملة افتراضيًا
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

      // إنشاء حساب الأدمن الافتراضي لو مفيش أي أدمن في القاعدة
      await seedDefaultAdmin();
    })();
  }
  return schemaReady;
}
