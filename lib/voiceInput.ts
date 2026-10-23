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
 * القدرات بتحكم مسار الترجمة (وسوم CSV في عمود capabilities):
 * - stt: ترجمة عبر chat_completions بمقطع input_audio (موديلات audio-native؛
 *   دي كمان فعالة للصفوف القديمة اللي capabilities فاضية).
 * - stt_transcriptions: ترجمة عبر /audio/transcriptions (موديلات تفريغ خالصة
 *   مثل whisper على OpenRouter — النداء JSON OpenAI-compatible).
 *
 * النماذج دي مخفية تمامًا: مش في قايمة الـAPI الخارجي ولا انتقاء الشات، مش ممكن
 * حد ينادي عليها مباشرة (403 من isVoiceModelActive) — هي بنية تحتية للترجمة بس.
 */

export interface VoiceInputModel {
  /** slug صف ai_models — للهوية والتشخيص فقط */
  id: string;
  baseUrl: string;
  /** الموديل اللي بيقرا الصوت عند المزوّد (مثال whisper أو نموذج audio-native) */
  model: string;
  apiKeys: string[];
  /** مسار الترجمة: chat = input_audio في chat_completions، transcriptions = /audio/transcriptions */
  path: "chat" | "transcriptions";
}

/** أول موديل ترجمة نشط بترتيب اليدوي — null لو مفيش. */
export async function getVoiceInputModel(): Promise<VoiceInputModel | null> {
  try {
    const rows = (await sql`
      SELECT id, base_url, model, api_keys, capabilities
      FROM ai_models
      WHERE is_active = TRUE AND modality = 'stt'
      ORDER BY sort_order ASC, created_at ASC
    `) as unknown as {
      id: string;
      base_url: string;
      model: string;
      api_keys: unknown;
      capabilities?: unknown;
    }[];
    const all = rows.map((r) => ({
      id: r.id,
      base_url: String(r.base_url ?? ""),
      model: String(r.model ?? ""),
      apiKeys: Array.isArray(r.api_keys)
        ? r.api_keys.filter((k): k is string => typeof k === "string" && k.length > 0)
        : [],
      caps: typeof r.capabilities === "string" ? r.capabilities.toLowerCase() : "",
    }));
    // وسوم الترجمة المسموحة: stt أو stt_transcriptions — الصفوف القديمة (capabilities فاضية)
    // بتتعامل كـ stt (chat) للتوافق الخلفي.
    const cap = all.find((r) => r.caps.includes("stt") || r.caps === "");
    if (!cap) return null;
    return {
      id: cap.id,
      baseUrl: cap.base_url,
      model: cap.model,
      apiKeys: cap.apiKeys,
      path: cap.caps.includes("stt_transcriptions") ? "transcriptions" : "chat",
    };
  } catch {
    return null;
  }
}

const TRANSCRIBE_PROMPT =
  "Transcribe this audio EXACTLY: write out what is said, word for word, in the same language the speaker uses. " +
  "Output ONLY the transcription text itself. No preamble, no comments, no quotation marks. " +
  "If the audio is empty or unintelligible, output exactly: [unintelligible]";

/** إشارة الطيّ من الموديل الصوتي — بنتعامل معاها كمافهاش ترجمة (ملاحظة «ماوصلش» الأصلية). */
const UNINTELLIGIBLE = "[unintelligible]";

/** مسار transcription من الـbase المخزّن — نفس فلسفة روابط الصوت الأخرى. */
function resolveTranscriptionsEndpoint(baseUrl: string): string {
  const b = baseUrl.split(/[?#]/)[0].replace(/\/+$/, "");
  if (!b) return "";
  if (/\/audio\/transcriptions\/?$/i.test(b)) return b;
  for (const other of [/\/audio\/speech\/?$/i, /\/chat\/completions\/?$/i, /\/responses\/?$/i]) {
    if (other.test(b)) return b.replace(other, "/audio/transcriptions");
  }
  if (/\/v1\/?$/i.test(b)) return `${b}/audio/transcriptions`;
  if (/\/v1\//i.test(b)) return `${b}/audio/transcriptions`.replace(/([^:])\/+/g, "$1/");
  return `${b}/v1/audio/transcriptions`;
}

/** يترجم تسجيل عبر /audio/transcriptions (JSON OpenAI-compatible) — null لو فشل. */
async function transcribeViaTranscriptions(
  m: VoiceInputModel,
  parts: { base64: string; format: "wav" | "mp3" },
  key: string
): Promise<string | null> {
  const endpoint = resolveTranscriptionsEndpoint(m.baseUrl);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model: m.model,
      input_audio: { data: parts.base64, format: parts.format },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    console.error(
      `[MALG stt] transcriptions ${res.status} من ${m.model}`,
      (await res.text().catch(() => "")).slice(0, 300)
    );
    return null;
  }
  const j = (await res.json().catch(() => null)) as { text?: unknown; choices?: unknown } | null;
  // OpenAI-compatible: { text: "..." } — وبأمان يتعامل مع أشكال أخرى للرد.
  if (typeof j?.text === "string") return j.text.trim() || null;
  const c = (j as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  return typeof c === "string" && c.trim() ? c.trim() : null;
}

/** يترجم تسجيل عبر chat_completions بـ input_audio (موديل audio-native) — null لو فشل. */
async function transcribeViaChat(
  m: VoiceInputModel,
  parts: { base64: string; format: "wav" | "mp3" },
  key: string
): Promise<string | null> {
  const endpoint = resolveProviderEndpoint(m.baseUrl, "chat_completions");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
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
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    console.error(
      `[MALG stt] chat ${res.status} من ${m.model}`,
      (await res.text().catch(() => "")).slice(0, 300)
    );
    return null;
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
  return text.trim() ? text.trim() : null;
}

/** يترجم تسجيل صوتي (data url) بموديل الإدخال الصوتي المعيّن — null لو فشل كل المحاولات. */
async function transcribeAudioWithModel(m: VoiceInputModel, audioUrl: string): Promise<string | null> {
  const parts = audioDataUrlParts(audioUrl);
  if (!parts) return null;
  for (const key of m.apiKeys.length > 0 ? m.apiKeys : [""]) {
    try {
      const out =
        m.path === "transcriptions"
          ? await transcribeViaTranscriptions(m, parts, key)
          : await transcribeViaChat(m, parts, key);
      const ok = out && out !== UNINTELLIGIBLE;
      if (out && !ok) console.error(`[MALG stt] رد غير مفهوم من موديل الصوت ${m.id}`);
      if (out && ok) return out;
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
