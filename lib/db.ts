import { neon } from "@neondatabase/serverless";

const connectionString = process.env.DATABASE_URL || "";

if (!connectionString) {
  // لا نرمي استثناء وقت الـ build، بس أي استعلام فعلي هيفشل برسالة واضحة.
  console.warn(
    "[db] DATABASE_URL مش متضبط — لازم تضيفه في متغيرات البيئة (Neon connection string)."
  );
}

export const sql = neon(connectionString);

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
    })();
  }
  return schemaReady;
}
