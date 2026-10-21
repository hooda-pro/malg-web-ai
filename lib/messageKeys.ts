import { isLocalMessageId, type ChatMessage } from "./types";

/** نص مبسّط للمقارنة: من غير كتلة الميتا المخفية ولا مسافات زيادة. */
function fingerprint(content: string): string {
  return content
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, "")
    .slice(0, 80);
}

function sameContent(a: ChatMessage, b: ChatMessage): boolean {
  const fa = fingerprint(a.content);
  const fb = fingerprint(b.content);
  if (!fa || !fb) return false;
  return fa === fb || fa.startsWith(fb.slice(0, 30)) || fb.startsWith(fa.slice(0, 30));
}

/**
 * بعد ما السيرفر يرجّع القايمة المحفوظة، الرسايل اللي كانت عندنا "متفائلة/محلية"
 * (رسالة المستخدم tmp-… ورد المساعد الحيّ) بتاخد id جديد. عشان React ما يبدّلش عناصر
 * الـDOM، بنربط كل رسالة جديدة بنفس مفتاح الواجهة القديم (clientKey).
 *
 * قواعد مهمة (كانت سبب اختفاء/تكرار الرد):
 * - الربط بيتم بالمحتوى الأول، ولو مفيش تطابق واضح بنرجع للترتيب — بس من غير ما
 *   رد محلي لسه ما اتحفظش "ياكل" رد جديد مش بتاعه.
 * - أي رسالة محلية لسه السيرفر ما رجّعهاش بتفضل ظاهرة في مكانها الأصلي (مش في آخر القايمة).
 * - `liveKey`: مفتاح الرد الحيّ اللي لسه خلص — بيتربط بأول رد مساعد جديد ملوش مفتاح.
 */
export function reconcileClientKeys(
  prev: ChatMessage[],
  fresh: ChatMessage[],
  keys: Map<string, string>,
  liveKey: string | null
): ChatMessage[] {
  const knownServerIds = new Set(prev.filter((m) => !isLocalMessageId(m.id)).map((m) => m.id));
  const pending = prev.filter((m) => isLocalMessageId(m.id));
  const incoming = fresh.filter((m) => !knownServerIds.has(m.id));

  const taken = new Set<string>(); // incoming ids اللي اتربطت بالفعل
  const matchedPending = new Set<string>();
  const bind = (p: ChatMessage, m: ChatMessage) => {
    keys.set(m.id, p.clientKey ?? p.id);
    matchedPending.add(p.id);
    taken.add(m.id);
  };

  // 1) تطابق بالمحتوى (الأدق)
  for (const p of pending) {
    const hit = incoming.find((m) => !taken.has(m.id) && m.role === p.role && sameContent(p, m));
    if (hit) bind(p, hit);
  }
  // 2) رسالة المستخدم المتفائلة: لو ما اتطابقتش بالمحتوى (السيرفر ممكن يعدّل النص)،
  //    نربطها بأول رسالة مستخدم جديدة. الرد المحلي ما بنربطوش بالترتيب أبدًا — عشان
  //    ما ياخدش مكان رد جديد.
  for (const p of pending) {
    if (matchedPending.has(p.id) || p.role !== "user") continue;
    const hit = incoming.find((m) => !taken.has(m.id) && m.role === "user");
    if (hit) bind(p, hit);
  }

  // 3) الرد الحيّ اللي لسه خلص → أول رد مساعد جديد ملوش ربط
  if (liveKey && !Array.from(keys.values()).includes(liveKey)) {
    const reply = incoming.find((m) => m.role === "assistant" && !taken.has(m.id) && !keys.has(m.id));
    if (reply) {
      keys.set(reply.id, liveKey);
      taken.add(reply.id);
    }
  }

  const merged = fresh.map((m) => (keys.has(m.id) ? { ...m, clientKey: keys.get(m.id) } : m));

  // 4) رد محلي لسه السيرفر ما رجّعوش → يفضل ظاهر في مكانه الأصلي (بعد الرسالة اللي قبله)
  const keyOf = (m: ChatMessage) => m.clientKey ?? m.id;
  for (const p of pending) {
    if (p.role !== "assistant" || matchedPending.has(p.id)) continue;
    const idxInPrev = prev.findIndex((m) => m.id === p.id);
    let insertAt = merged.length;
    for (let j = idxInPrev - 1; j >= 0; j--) {
      const q = prev[j];
      const at = merged.findIndex((m) => m.id === q.id || keyOf(m) === keyOf(q));
      if (at !== -1) {
        insertAt = at + 1;
        break;
      }
    }
    merged.splice(insertAt, 0, p);
  }
  return merged;
}
