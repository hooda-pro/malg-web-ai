import { NextRequest, NextResponse } from "next/server";
import { sql, ensureSchema } from "@/lib/db";
import { requireAdmin, logAdminAction } from "@/lib/adminGuard";
import { cleanBaseUrl, invalidateProviderCache, sanitizeModelId } from "@/lib/provider";

export const dynamic = "force-dynamic";

/**
 * سحب قدرات الموديل وتسعيره آليًا من OpenRouter — بمصدرين:
 *
 * ١) GET /models/{model}/endpoints (لروابط openrouter.ai) — بيانات أدق للصوت
 *    (نسخ صوتي وغيره). ملاحظة مهمة: الموديلات المجانية (:free) بترجّع
 *    endpoints فاضية — فبنكمل للمصدر التاني.
 *
 * ٢) القايمة العامة GET /models — فيها الأسعار والمعمارية لكل الموديلات
 *    المعروفة على OpenRouter (مجانية ومدفوعة، ومن كل المزوّدات). دي بتشتغل
 *    حتى لو مزوّد الموديل الفعلي مش OpenRouter — السعر المرجعي بيتطابق
 *    بمرونة (بالاسم الكامل، أو آخر جزء من المعرّف، أو الاسم المعروض).
 *
 * التسعير: OpenRouter بيرجّع pricing.prompt/completion كدولار لكل توكن واحد
 * (وسالب -1 = تسعير ديناميكي غير معلن). بنحوّله لـmicro-dollar لكل مليون وحدة.
 * «مجاني معلن» (0/0) بيتخزن زي أي سعر معلن — و«مفيش سعر معلن» بيسيب الأسعار
 * المخزنة زي ما هي بدل ما يصفّرها بالغلط.
 */

interface OrArchitecture {
  modality?: unknown;
  input_modalities?: unknown;
  output_modalities?: unknown;
}

interface OrPricing {
  prompt?: unknown;
  completion?: unknown;
}

interface OrEndpoint {
  provider_name?: unknown;
  supports_voice_cloning?: unknown;
  supports_multiple_audio_references?: unknown;
  supports_image_reference?: unknown;
  supports_diarization?: unknown;
  pricing?: OrPricing;
  context_length?: unknown;
}

interface OrCatalogModel {
  id?: unknown;
  name?: unknown;
  architecture?: OrArchitecture;
  pricing?: OrPricing;
  context_length?: unknown;
}

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

/** سعر معلن من OpenRouter → µ$ لكل مليون وحدة. null = مفيش سعر معلن (-1/مفقود). */
function priceFromOpenRouter(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(Math.round(n * 1_000_000_000_000), 1_000_000_000); // سقف $1000/1M
}

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

/** مطابقة مرنة لموديل في القايمة العامة — بالمعرّف كامل، أو آخر جزء منه، أو الاسم المعروض.
 * الترتيب مقصود: المطابقة التامة الأول، وبعدين الأقرب — عشان موديل زي
 * deepseek/deepseek-chat-v3.1:free مايتطابقش بالغلط مع موديل مختلف. */
function findInCatalog(list: OrCatalogModel[], modelRaw: string, displayName: string): OrCatalogModel | null {
  const target = norm(modelRaw);
  const tail = target.split("/").pop() || target;
  const disp = norm(displayName);
  const idOf = (m: OrCatalogModel) => norm(m.id);

  // ١) مطابقة تامة للمعرّف — أدق حاجة
  if (target) {
    const exact = list.find((m) => idOf(m) === target);
    if (exact) return exact;
  }
  // ٢) آخر جزء من المعرّف — تام على مستوى الجزء، ولو فيه أكتر من واحد بنفضّل
  //    اللي معاه نفس لاحقة الأسعار (:free) أو اللي معرّفه أقرب للهدف.
  //    بنجرب الـtail زي ما هو وبعد شيل لاحقة الأسعار (:free وغيرها) — عشان
  //    deepseek/deepseek-chat-v3.1:free تلاقي deepseek/deepseek-chat-v3.1.
  if (tail) {
    const tailNoSuffix = tail.replace(/:[a-z0-9._-]+$/i, "");
    const tailMatches = list.filter((m) => {
      const id = idOf(m);
      const idTail = id.split("/").pop() || id;
      const idTailNoSuffix = idTail.replace(/:[a-z0-9._-]+$/i, "");
      return (
        idTail === tail ||
        id.endsWith(`/${tail}`) ||
        (tailNoSuffix !== tail && (idTail === tailNoSuffix || id.endsWith(`/${tailNoSuffix}`)))
      );
    });
    if (tailMatches.length === 1) return tailMatches[0];
    if (tailMatches.length > 1) {
      const targetNoSuffix = target.replace(/:[a-z0-9._-]+$/i, "");
      const pick =
        tailMatches.find((m) => idOf(m) === targetNoSuffix) ??
        tailMatches.find((m) => idOf(m) === target) ??
        tailMatches.find((m) => /:free$/.test(idOf(m)) === /:free$/.test(target)) ??
        tailMatches[0];
      return pick;
    }
  }
  // ٣) الاسم المعروض — تام أو احتواء من الطرفين (بحد أدنى للطول عشان مايصطدمش)
  if (disp.length >= 4) {
    const byName =
      list.find((m) => norm(m.name) === disp) ??
      list.find((m) => {
        const n = norm(m.name);
        return n.length >= 4 && (n.includes(disp) || disp.includes(n));
      });
    if (byName) return byName;
  }
  return null;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();
  const id = sanitizeModelId((await params)?.id);
  if (!id) return NextResponse.json({ error: "معرف الموديل غير صالح" }, { status: 400 });

  const rows = (await sql`SELECT id, name, base_url, model, modality FROM ai_models WHERE id = ${id} LIMIT 1`) as {
    id: string;
    name: string;
    base_url: string;
    model: string;
    modality: string;
  }[];
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "الموديل غير موجود" }, { status: 404 });

  const modelRaw = String(row.model || "").trim();
  if (!modelRaw) {
    return NextResponse.json({ error: "اكتب اسم الموديل في نموذج المزوّد الأول" }, { status: 400 });
  }

  const baseUrl = cleanBaseUrl(row.base_url || "");
  const isOpenRouter = /openrouter\.ai/i.test(baseUrl);
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  let arch: OrArchitecture | null = null;
  let ep: OrEndpoint | null = null;
  let pricing: OrPricing | null = null;
  let ctxLenRaw: unknown = null;
  let matchedId = modelRaw;
  let source = "";

  // ——— المرحلة ١: endpoints (روابط openrouter.ai بس — بيانات أدق للصوت) ———
  if (isOpenRouter) {
    try {
      // عشان توجيه endpoints نابع من OpenRouter: بعت الاسم زي ما هو مكتوب (باللاحقة) —
      // بالتجربة الاسم من غير «:free» بيرجّع endpoints فاضية وما يتسحبوش فيها بيانات.
      const res = await fetch(
        `https://openrouter.ai/api/v1/models/${encodeURIComponent(modelRaw)}/endpoints`,
        { signal: AbortSignal.timeout(30_000) }
      );
      if (res.ok) {
        const j = (await res.json()) as {
          data?: { architecture?: OrArchitecture; endpoints?: OrEndpoint[] } | null;
        } | null;
        const e = j?.data?.endpoints?.[0];
        if (j?.data && e) {
          arch = j.data.architecture ?? null;
          ep = e;
          pricing = e.pricing ?? null;
          ctxLenRaw = e.context_length;
          matchedId = modelRaw;
          source = "endpoints";
        }
      }
    } catch {
      // فشل الشبكة/التحليل — نكمل للقايمة العامة
    }
  }

  // ——— المرحلة ٢: القايمة العامة — بتغطي كل الموديلات المعروفة (حتى المجانية
  // اللي endpoints بتاعتها فاضية، وحتى موديلات مزوّدات تانية كمرجع تسعير) ———
  if (!ep) {
    try {
      const res = await fetch(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const j = (await res.json()) as { data?: OrCatalogModel[] | null } | null;
      const list = Array.isArray(j?.data) ? j.data : [];
      const hit = findInCatalog(list, modelRaw, row.name);
      if (!hit) {
        return NextResponse.json(
          { error: `ملقيناش «${modelRaw}» في قايمة OpenRouter العامة — راجع الاسم في نموذج المزوّد أو سعّر يدويًا` },
          { status: 404 }
        );
      }
      arch = hit.architecture ?? null;
      pricing = hit.pricing ?? null;
      ctxLenRaw = hit.context_length;
      matchedId = String(hit.id ?? modelRaw);
      source = "catalog";
    } catch {
      return NextResponse.json({ error: "تعذّر الوصول لقايمة OpenRouter — حاول مجددًا" }, { status: 502 });
    }
  }

  // ——— القدرات ———
  const inputMods = arr(arch?.input_modalities);
  const outputMods = arr(arch?.output_modalities);
  const speechOutput = outputMods.includes("speech") || outputMods.includes("audio");

  const caps: string[] = [];
  if (speechOutput) caps.push("tts");
  if (inputMods.includes("audio")) {
    // مدخل صوت لوحده (موديل تفريغ خالص زي whisper) ← سيب عبر /audio/transcriptions؛
    // مدخل صوت بقالة موديل شات متعدد ← عبر input_audio في الشات.
    caps.push(inputMods.length > 1 ? "stt" : "stt_transcriptions");
  }
  if (ep?.supports_voice_cloning === true) caps.push("clone");

  const capabilitiesCsv = caps.length ? [...new Set(caps)].join(",") : "none";
  // صيغ الصوت: بتتخزن لصفوف توليد الصوت بس (الترميزات المتاحة على OpenRouter: mp3/pcm)
  const audioFormatsCsv = speechOutput ? "mp3,pcm" : "";

  // ——— التسعير ———
  const priceIn = priceFromOpenRouter(pricing?.prompt);
  const priceOut = priceFromOpenRouter(pricing?.completion);
  const pricingKnown = priceIn !== null || priceOut !== null;
  const isFree = pricingKnown && (priceIn ?? 0) === 0 && (priceOut ?? 0) === 0;

  // ملاحظة السياق من context_length (مثال: 1,056,736 → "1.1M") — تعريفية للعرض
  const ctxLen = Number(ctxLenRaw);
  const contextNote =
    Number.isFinite(ctxLen) && ctxLen > 0
      ? ctxLen >= 1_000_000
        ? `${(ctxLen / 1_000_000).toFixed(1)}M`
        : `${Math.round(ctxLen / 1000)}K`
      : "";

  // الأسعار والسياق بيتحدثوا بس لما يكونوا معلنين — غير كده بنسيب اللي الأدمن دخله يدويًا
  await sql`
    UPDATE ai_models SET
      capabilities = ${capabilitiesCsv},
      audio_formats = ${audioFormatsCsv},
      price_in_usd = COALESCE(${priceIn}, price_in_usd),
      price_out_usd = COALESCE(${priceOut}, price_out_usd),
      context_note = CASE WHEN ${contextNote} <> '' THEN ${contextNote} ELSE context_note END,
      updated_at = now()
    WHERE id = ${id}
  `;
  invalidateProviderCache();

  const priceText = !pricingKnown
    ? "مفيش سعر معلن — اتسيبت الأسعار المخزنة زي ما هي"
    : isFree
      ? "مجاني معلن (0/0) — مش هيتم خصم رصيد"
      : `In $${(priceIn ?? 0) / 1e6} × Out $${(priceOut ?? 0) / 1e6} لكل مليون`;
  await logAdminAction(
    guard.admin,
    "update_model",
    null,
    null,
    `سحب ${id} من OpenRouter (${source} → ${matchedId}): ${capabilitiesCsv || "فاضي"} / صيغ: ${audioFormatsCsv || "فاضي"} / سعر: ${priceText}`
  );

  return NextResponse.json({
    ok: true,
    capabilities: capabilitiesCsv ? capabilitiesCsv.split(",") : [],
    audioFormats: audioFormatsCsv ? audioFormatsCsv.split(",") : [],
    audio_formats: audioFormatsCsv,
    pricing: {
      known: pricingKnown,
      free: isFree,
      priceInUsd: (priceIn ?? 0) / 1e6,
      priceOutUsd: (priceOut ?? 0) / 1e6,
      contextNote,
    },
    meta: {
      source,
      matchedId,
      provider: typeof ep?.provider_name === "string" ? ep.provider_name : "",
      inputModalities: inputMods,
      outputModalities: outputMods,
      supportsVoiceCloning: ep?.supports_voice_cloning === true,
      supportsMultipleAudioReferences: ep?.supports_multiple_audio_references === true,
      supportsImageReference: ep?.supports_image_reference === true,
      supportsDiarization: ep?.supports_diarization === true,
      usedModelName: modelRaw,
    },
  });
}
