import { randomUUID } from "crypto";
import { sql } from "./db";

export const FACT_MAX_CHARS = 300;
export const FACTS_MAX_PER_USER = 100;

export interface UserFact {
  id: string;
  fact: string;
  category: string;
  createdAt: string;
}

function mapFact(row: any): UserFact {
  return {
    id: row.id,
    fact: row.fact,
    category: row.category ?? "عام",
    createdAt: row.created_at,
  };
}

export async function listFacts(userId: string, limit = 50): Promise<UserFact[]> {
  const lim = Math.max(1, Math.min(Math.floor(limit) || 50, 100));
  const rows = (await sql`
    SELECT id, fact, category, created_at FROM user_facts
    WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${lim}
  `) as any[];
  return rows.map(mapFact);
}

export async function addFact(userId: string, fact: string, category: string): Promise<UserFact> {
  const f = fact.trim().slice(0, FACT_MAX_CHARS);
  const c = (category || "عام").trim().slice(0, 30) || "عام";
  const id = randomUUID();
  const rows = (await sql`
    INSERT INTO user_facts (id, user_id, fact, category)
    VALUES (${id}, ${userId}, ${f}, ${c})
    RETURNING id, fact, category, created_at
  `) as any[];
  // سقف 100 حقيقة/يوزر — احذف الأقدم زيادة
  await sql`
    DELETE FROM user_facts WHERE user_id = ${userId} AND id NOT IN (
      SELECT id FROM user_facts WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${FACTS_MAX_PER_USER}
    )
  `;
  return mapFact(rows[0]);
}

export async function deleteFact(userId: string, id: string): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM user_facts WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `) as any[];
  return rows.length > 0;
}

export async function getTopFacts(userId: string, limit = 10): Promise<UserFact[]> {
  return listFacts(userId, Math.max(1, Math.min(limit, 20)));
}

/** كتلة جاهزة للحقن في الـ system prompt (فارغة لو مفيش حقائق). */
export function buildFactsBlock(facts: UserFact[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) => `- [${f.category}] ${f.fact}`);
  return `USER FACTS (حقائق محفوظة عن المستخدم — راعها في ردودك):\n${lines.join("\n")}`;
}
