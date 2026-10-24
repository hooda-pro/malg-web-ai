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
 *   زي whisper على Groq/OpenAI) — القياسي هناك multipart/form-data بملف audio،
 *   ولو رفض بنحاول صيغة JSON بـinput_audio (سيرفرات مخصصة بس).
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

/** امتداد الملف الصوتي الفعلي من mime الـdata URL — للـmultipart (المزوّد بيتحقق من الامتداد).
 * audioDataUrlParts بتحصر الصيغة في wav/mp3 لمسار input_audio؛ دي أوسع للـmultipart:
 * webm/ogg/m4a/flac بالاسم الصحيح عشان سرير التفريغ يقبل التفريغ بدون سؤال. */
function audioFileExt(dataUrl: string): string {
  const sep = dataUrl.indexOf(";", 5);
  const mime = (sep > 5 ? dataUrl.slice(5, sep) : "").toLowerCase();
  const t = mime.startsWith("audio/") ? mime.slice(6) : "";
  if (/^(mp3|mpeg|mpga)$/.test(t)) return "mp3";
  if (/^wav|^x-wav$|^wave$/.test(t)) return "wav";
  if (/^m4a$|^mp4$|^x-m4a$/.test(t)) return "m4a";
  if (/^webm/.test(t)) return "webm";
  if (/^ogg/.test(t)) return "ogg";
  if (/^opus/.test(t)) return "opus";
  if (/^flac|^x-flac$/.test(t)) return "flac";
  const guess = t.replace(/[^a-z0-9]/g, "").slice(0, 5);
  return guess || "wav";
}

/** يستخرج نص التفريغ من رد JSON OpenAI-compatible ({text}) — وأمان مع أشكال الردود التانية. */
function transcriptionTextFrom(j: unknown): string | null {
  const o = j as { text?: unknown; choices?: { message?: { content?: unknown } }[] } | null;
  if (!o || typeof o !== "object") return null;
  if (typeof o.text === "string") return o.text.trim() || null;
  const c = o.choices?.[0]?.message?.content;
  return typeof c === "string" && c.trim() ? c.trim() : null;
}

/**
 * يترجم تسجيل عبر /audio/transcriptions — null لو فشل.
 *
 * القياسي المفتوح-التوافق هنا هو multipart/form-data بملف audio (Groq وOpenAI
 * وسيرفرات whisper القياسية كلها بتستقبل الملف كده — الاسم/الامتداد بيتبني من
 * mime الـdata URL الفعلي). لو رفض المزوّد كده بنحاول صيغة JSON بـinput_audio —
 * دي نوعية سيرفرات مخصصة بس، فبتكون محاولة ثانية مش الأولانية.
 */
async function transcribeViaTranscriptions(
  m: VoiceInputModel,
  parts: { base64: string; format: "wav" | "mp3" },
  fileExt: string,
  key: string
): Promise<string | null> {
  const endpoint = resolveTranscriptionsEndpoint(m.baseUrl);
  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;
  // ١) multipart/form-data + ملف audio — مسار Groq/OpenAI القياسي
  try {
    const bytes = new Uint8Array(Buffer.from(parts.base64, "base64"));
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: "application/octet-stream" }), `audio.${fileExt}`);
    form.append("model", m.model);
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) return transcriptionTextFrom(await res.json().catch(() => null));
    console.error(
      `[MALG stt] transcriptions ${res.status} من ${m.model}`,
      (await res.text().catch(() => "")).slice(0, 300)
    );
  } catch (e) {
    console.error("[MALG stt] فشل نداء transcriptions (multipart)", e);
  }
  // ٢) fallback: JSON بـinput_audio — لبعض السيرفرات اللي بتعرف الصيغة دي بس
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        model: m.model,
        input_audio: { data: parts.base64, format: parts.format },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.ok) return transcriptionTextFrom(await res.json().catch(() => null));
    console.error(
      `[MALG stt] transcriptions(json) ${res.status} من ${m.model}`,
      (await res.text().catch(() => "")).slice(0, 300)
    );
  } catch (e) {
    console.error("[MALG stt] فشل نداء transcriptions (json)", e);
  }
  return null;
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
  const fileExt = audioFileExt(audioUrl);
  for (const key of m.apiKeys.length > 0 ? m.apiKeys : [""]) {
    try {
      // المسار المضبوط في القدرات أولًا، ولو فشل بنجرّب المسار التاني مرة واحدة —
      // عشان صف متسجّل بالغلط (stt بدل stt_transcriptions أو العكس، زي whisper
      // المنقولة إلى فعالية القراءة عبر الشات رغم إنها مش بيدعمها أصلًا) ميوقفش «أذن المنصة».
      let out =
        m.path === "transcriptions"
          ? await transcribeViaTranscriptions(m, parts, fileExt, key)
          : await transcribeViaChat(m, parts, key);
      if (!out) {
        out =
          m.path === "transcriptions"
            ? await transcribeViaChat(m, parts, key)
            : await transcribeViaTranscriptions(m, parts, fileExt, key);
      }
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

/**
 * زر اختبار اللوحة: نداء فعلي واحد لـ/audio/transcriptions بـWAV مصغر
 * (0.1 ثانية صمت 8kHz/16-bit/mono) — بيكفي إن المزوّد يقبل الطلب (رابط + مفتاح
 * + اسم موديل متقبلين). نص التفريغ مش المهم هنا، الرسالة 200 هي الإثبات.
 */
export async function probeTranscriptionEndpoint(
  baseUrl: string,
  model: string,
  key: string
): Promise<{ ok: boolean; status?: number; detail: string; endpoint: string }> {
  const endpoint = resolveTranscriptionsEndpoint(baseUrl);
  if (!model) return { ok: false, detail: "اسم الموديل مفقود", endpoint };
  const sampleRate = 8000;
  const samples = 800; // 0.1 ثانية
  const dataSize = samples * 2;
  const buf = new Uint8Array(44 + dataSize);
  const dv = new DataView(buf.buffer);
  const wr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  wr(0, "RIFF"); dv.setUint32(4, 36 + dataSize, true); wr(8, "WAVE");
  wr(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true); dv.setUint32(28, sampleRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  wr(36, "data"); dv.setUint32(40, dataSize, true);
  try {
    const form = new FormData();
    form.append("file", new Blob([buf], { type: "application/octet-stream" }), "probe.wav");
    form.append("model", model);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return { ok: res.ok, status: res.status, detail, endpoint };
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : "فشل الشبكة عند نداء التفريغ",
      endpoint,
    };
  }
}
