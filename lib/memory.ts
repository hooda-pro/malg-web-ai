import { sql } from "./db";
import {
  DEFAULT_MODEL,
  negotiateUpstream,
  readUpstreamStream,
  type ApiMessage,
} from "./ai";

// ذاكرة خفيفة ومجانية عمليًا:
// - صف واحد صغير (800 حرف كحد أقصى) لكل مستخدم — مساحة لا تُذكر.
// - التحديث عبر المزوّد الرخيص الافتراضي، مرة واحدة يوميًا كحد أقصى،
//   وبدون خصم من رصيد المستخدم (المنصة تتحمل ~1000 توكن رخيص).
const MAX_SUMMARY_CHARS = 800;
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;
const MIN_TURNS = 4;

export async function getMemory(userId: string): Promise<string | null> {
  try {
    const rows = (await sql`SELECT summary FROM user_memory WHERE user_id = ${userId}`) as {
      summary: string;
    }[];
    const s = (rows[0]?.summary || "").trim();
    return s ? s.slice(0, MAX_SUMMARY_CHARS) : null;
  } catch {
    return null;
  }
}

/** best-effort ولا ترمي أبدًا — تُستدعى fire-and-forget بعد حفظ الرد. */
export async function maybeRefreshMemory(
  userId: string,
  history: { role: string; content: string }[]
): Promise<void> {
  try {
    const rows = (await sql`SELECT summary, updated_at FROM user_memory WHERE user_id = ${userId}`) as {
      summary: string;
      updated_at: string | null;
    }[];
    const last = rows[0]?.updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    if (Date.now() - last < REFRESH_AFTER_MS) return;
    const turns = history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8);
    if (turns.length < MIN_TURNS) return;
    const NL = String.fromCharCode(10);
    const digest = turns
      .map((m) => `${m.role === "user" ? "U" : "A"}: ${String(m.content || "").slice(0, 600)}`)
      .join(NL)
      .slice(0, 4000);
    if (!digest.trim()) return;
    const prev = (rows[0]?.summary || "").trim().slice(0, MAX_SUMMARY_CHARS);
    const messages: ApiMessage[] = [
      {
        role: "system",
        content:
          "لخّص باختصار شديد (سطر أو سطرين بالعربي) أهم الحقائق الثابتة عن المستخدم: اسمه، اهتماماته، مشاريعه، تفضيلاته. تجاهل التفاصيل المؤقتة. أخرج الخلاصة فقط بدون مقدمات.",
      },
      { role: "user", content: `ملخص قديم: ${prev || "لا يوجد"}${NL}${NL}أحدث محادثة:${NL}${digest}` },
    ];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const n = await negotiateUpstream(messages, controller.signal, DEFAULT_MODEL);
      if (!n.ok) return;
      const r = await readUpstreamStream(n.response, controller.signal, () => {}, undefined, n.protocol);
      const summary = (r.content || "").trim().slice(0, MAX_SUMMARY_CHARS);
      if (!summary) return;
      await sql`
        INSERT INTO user_memory (user_id, summary, updated_at)
        VALUES (${userId}, ${summary}, now())
        ON CONFLICT (user_id) DO UPDATE SET summary = ${summary}, updated_at = now()
      `;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // best-effort — أي فشل يتجاهل بصمت
  }
}
