import { sql } from "@/lib/db";
import { resolveProviderEndpoint } from "@/lib/provider";
import { audioDataUrlParts, extractAttachmentsMeta } from "@/lib/attachments";

/**
 * موديل الإدخال الصوتي (STT) — «أذن المنصة».
 *
 * الأدمن يضيف صفوف ai_models بـ modality='stt' من واجهة «النماذج الصوتية» باللوحة
 * (ويربط الموديل والمفاتيح من نموذج المزوّد). الصفوف دي مربوطة بجميع موديلات الشات:
 * لما حد يبعت تسجيل صوتي لموديل مش بيسمع أصلًا، الموديل اللي هنا بيقرا الصوت
 * ويرجّعه نص، والنص بيروح لموديل الشات كأنه كلام المستخدم — شوف toApiUserContent.
 *
 * النماذج دي مخفية تمامًا: مش في قايمة الـAPI الخارجي ولا انتقاء الشات، مش ممكن
 * حد ينادي عليها مباشرة (403 من isVoiceModelActive) — هي بنية تحتية للترجمة بس.
 */

export interface VoiceInputModel {
  /** slug صف ai_models — للهوية والتشخيص فقط */
  id: string;
  baseUrl: string;
  /** الموديل اللي بيقرا الصوت عند المزوّد (مثال: fish-audio/s2.1-pro-free:free) */
  model: string;
  apiKeys: string[];
}

/** أول موديل إدخال صوتي نشط (modality='stt') بالترتيب اليدوي — null لو مفيش. */
export async function getVoiceInputModel(): Promise<VoiceInputModel | null> {
  try {
    const rows = (await sql`
      SELECT id, base_url, model, api_keys
      FROM ai_models
      WHERE is_active = TRUE AND modality = 'stt'
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1
    `) as unknown as { id: string; base_url: string; model: string; api_keys: unknown }[];
    const r = rows[0];
    if (!r) return null;
    const apiKeys = Array.isArray(r.api_keys)
      ? r.api_keys.filter((k): k is string => typeof k === "string" && k.length > 0)
      : [];
    return { id: r.id, baseUrl: String(r.base_url ?? ""), model: String(r.model ?? ""), apiKeys };
  } catch {
    return null;
  }
}

const TRANSCRIBE_PROMPT =
  "Transcribe this audio EXACTLY: write out what is said, word for word, in the same language the speaker uses. " +
  "Output ONLY the transcription text itself. No preamble, no comments, no quotation marks. " +
  "If the audio is empty or unintelligible, output exactly: [unintelligible]";

/** إشارة الطيّ من الموديل الصوتي — بنتعامل معاها كمافهاش ترجمة (بنستخدم ملاحظة «ماوصلش» الأصلية). */
const UNINTELLIGIBLE = "[unintelligible]";

/** يترجم تسجيل صوتي (data url) بموديل إدخال صوتي معيّن — null لو فشل كل المحاولات. */
async function transcribeAudioWithModel(m: VoiceInputModel, audioUrl: string): Promise<string | null> {
  const parts = audioDataUrlParts(audioUrl);
  if (!parts) return null;
  const endpoint = resolveProviderEndpoint(m.baseUrl, "chat_completions");
  const body = {
    model: m.model,
    temperature: 0,
    max_tokens: 1024,
    stream: false,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_PROMPT },
          { type: "input_audio", input_audio: { data: parts.base64, format: parts.format } },
        ],
      },
    ],
  };
  for (const key of m.apiKeys.length > 0 ? m.apiKeys : [""]) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) {
        console.error(
          `[MALG stt] ${res.status} من موديل الصوت ${m.model}`,
          (await res.text().catch(() => "")).slice(0, 300)
        );
        continue;
      }
      const data = (await res.json().catch(() => null)) as
        | { choices?: { message?: { content?: string | unknown } }[] }
        | null;
      const c = data?.choices?.[0]?.message?.content;
      const text =
        typeof c === "string"
          ? c
          : Array.isArray(c)
            ? c
                .map((p) =>
                  p && typeof p === "object" && "text" in (p as object)
                    ? String((p as { text?: unknown }).text ?? "")
                    : ""
                )
                .join("")
            : "";
      const clean = text.trim();
      if (clean && clean !== UNINTELLIGIBLE) return clean;
      console.error(`[MALG stt] رد فاضي/غير مفهوم من موديل الصوت ${m.id}`);
    } catch (e) {
      console.error("[MALG stt] فشل نداء موديل الصوت", e);
    }
  }
  return null;
}

/**
 * المسار العالمي للتسجيلات الصوتية: بيتستدعى لما الموديل المستهدف مش بيسمع أصلًا،
 * بترجم كل تسجيل واصل في رسالة المستخدم بموديل الإدخال الصوتي، ويرجّع نصوص
 * بنفس ترتيب مرفقات الصوت في الميتا (الترتيب ثابت لأن extractAttachmentsMeta
 * بيحلل الميتا بنفس الترتيب).
 * استدِعها فقط لما الموديل المستهدف مش بيستقبل الصوت أصلًا (شوف toApiUserContent
 * و /api/chat). null = مفيش صف stt ولا تسجيلات؛ والفشل الفردي بيرجّع null مكانه.
 */
export async function transcribeVoiceAttachments(content: string): Promise<(string | null)[] | null> {
  const { attachments } = extractAttachmentsMeta(content);
  const audios = attachments.filter((a) => a.kind === "audio");
  if (audios.length === 0) return null;
  const model = await getVoiceInputModel();
  if (!model || model.apiKeys.length === 0) {
    console.warn("[MALG chat] تعديل الصوت اتخطى — لا يوجد موديل إدخال صوتي نشط (modality=stt)");
    return null;
  }
  return Promise.all(
    audios.map(async (a) => {
      const t = await transcribeAudioWithModel(model, a.audioUrl ?? "");
      return t && t.trim() ? t.trim().slice(0, 4000) : null;
    })
  );
}
