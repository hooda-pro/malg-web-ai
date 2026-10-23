import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { cleanBaseUrl, invalidateProviderCache, sanitizeModelId } from "@/lib/provider";

export const dynamic = "force-dynamic";

/**
 * سحب قدرات الموديل من OpenRouter آليًا (GET /models/{model}/endpoints — عام من غير مفتاح):
 * - مخرجات speech/audio → قدرة «توليد صوت»
 * - مدخلات audio → «تفريغ صوتي» (مدخل صوت خالص) أو «قراءة صوت» (موديل شات متعدد كامل)
 * - supports_voice_cloning → قدرة «نسخ صوتي»
 * - صيغ الصوت: الصيغ المسموحة للـspeech على OpenRouter هي mp3/pcm — بتتسجل للصفوف بتاعة توليد الصوت،
 *   والأدمن يقدر يعدل أي حاجة يدويًا بعدها.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  const id = sanitizeModelId((await params)?.id);
  if (!id) return NextResponse.json({ error: "معرف الموديل غير صالح" }, { status: 400 });

  const rows = (await sql`SELECT id, base_url, model, modality FROM ai_models WHERE id = ${id} LIMIT 1`) as {
    id: string;
    base_url: string;
    model: string;
    modality: string;
  }[];
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "الموديل غير موجود" }, { status: 404 });

  const baseUrl = cleanBaseUrl(row.base_url || "");
  if (!/openrouter\.ai/i.test(baseUrl)) {
    return NextResponse.json(
      { error: "سحب القدرات حاليًا لمزودات OpenRouter بس — باقي الروابط بتتحدد يدويًا من الشرائح" },
      { status: 400 }
    );
  }
  const modelRaw = String(row.model || "").trim();
  if (!modelRaw) {
    return NextResponse.json({ error: "اكتب اسم الموديل في نموذج المزوّد الأول" }, { status: 400 });
  }

  interface OpenRouterEndpointsResponse {
    data?: {
      architecture?: { modality?: unknown; input_modalities?: unknown; output_modalities?: unknown };
      endpoints?: {
        provider_name?: unknown;
        supports_voice_cloning?: unknown;
        supports_multiple_audio_references?: unknown;
        supports_image_reference?: unknown;
        supports_diarization?: unknown;
      }[];
    } | null;
  }

  // عشان توجيه endpoints نابع من OpenRouter: بعت الاسم زي ما هو مكتوب (باللاحقة) —
  // بالتجربة الاسم من غير «:free» بيرجّع endpoints فاضية وما يتسحبوش فيها بيانات.
  const baseModel = modelRaw;
  let j: OpenRouterEndpointsResponse | null = null;
  try {
    const res = await fetch(
      `https://openrouter.ai/api/v1/models/${encodeURIComponent(baseModel)}/endpoints`,
      { signal: AbortSignal.timeout(30_000) }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `OpenRouter رفض طلب السحب (${res.status}) — اتأكد إن اسم الموديل مكتوب صح في نموذج المزوّد` },
        { status: 502 }
      );
    }
    j = (await res.json()) as OpenRouterEndpointsResponse;
  } catch {
    return NextResponse.json({ error: "تعذّر الوصول لـOpenRouter — حاول مجددًا" }, { status: 502 });
  }
  const d = j?.data;
  const ep = d?.endpoints?.[0];
  if (!d || !ep) {
    return NextResponse.json({ error: `OpenRouter معرفش نموذج «${modelRaw}» — راجع الاسم في نموذج المزوّد` }, { status: 400 });
  }

  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const inputMods = arr(d.architecture?.input_modalities);
  const outputMods = arr(d.architecture?.output_modalities);
  const speechOutput = outputMods.includes("speech") || outputMods.includes("audio");

  const caps: string[] = [];
  if (speechOutput) caps.push("tts");
  if (inputMods.includes("audio")) {
    // مدخل صوت لوحده (موديل تفريغ خالص زي whisper) ← سيب عبر /audio/transcriptions؛
    // مدخل صوت بقالة موديل شات متعدد ← عبر input_audio في الشات.
    caps.push(inputMods.length > 1 ? "stt" : "stt_transcriptions");
  }
  if (ep.supports_voice_cloning === true) caps.push("clone");

  const capabilitiesCsv = caps.length ? [...new Set(caps)].join(",") : "none";
  // صيغ الصوت: بتتخزن لصفوف توليد الصوت بس (الترميزات المتاحة على OpenRouter: mp3/pcm)
  const audioFormatsCsv = speechOutput ? "mp3,pcm" : "";

  await sql`UPDATE ai_models SET capabilities = ${capabilitiesCsv}, audio_formats = ${audioFormatsCsv}, updated_at = now() WHERE id = ${id}`;
  invalidateProviderCache();
  await logAdminAction(
    guard.admin,
    "update_model",
    null,
    null,
    `سحب قدرات ${id} من OpenRouter: ${capabilitiesCsv || "فاضي"} / صيغ: ${audioFormatsCsv || "فاضي"}`
  );

  return NextResponse.json({
    ok: true,
    capabilities: capabilitiesCsv ? capabilitiesCsv.split(",") : [],
    audioFormats: audioFormatsCsv ? audioFormatsCsv.split(",") : [],
    audio_formats: audioFormatsCsv,
    meta: {
      provider: typeof ep.provider_name === "string" ? ep.provider_name : "",
      inputModalities: inputMods,
      outputModalities: outputMods,
      supportsVoiceCloning: ep.supports_voice_cloning === true,
      supportsMultipleAudioReferences: ep.supports_multiple_audio_references === true,
      supportsImageReference: ep.supports_image_reference === true,
      supportsDiarization: ep.supports_diarization === true,
      usedModelName: baseModel,
    },
  });
}
