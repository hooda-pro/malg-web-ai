import { NextRequest, NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { requireAdmin } from "@/lib/adminGuard";
import { getDefaultModelId, getSavedModelProvider, sanitizeModelId, validateProviderInput, resolveProviderEndpoint, type ProviderInput } from "@/lib/provider";
import { buildUpstreamBody, classifyUpstreamError, extractResponsesSample } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * اختبار اتصال المزوّد قبل الحفظ — بيبعت طلب حقيقي مصغر بأول مفتاح
 * بنفس البروتوكول الذي سيُستخدم أثناء التشغيل الفعلي:
 * - chat_completions: messages + max_tokens + stream:false
 * - responses: input + max_output_tokens + stream:false
 * المفاتيح عمرها ما بتتخزن هنا — بتتجرب وتترمي.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.res;

  await ensureSchema();

  const body = (await req.json().catch(() => ({}))) as ProviderInput & { savedKeyIndex?: unknown; modelId?: unknown };
  const modelId = sanitizeModelId(body.modelId ?? "") || (await getDefaultModelId());
  // وضعان: (1) اختبار قيم الفورم بمفتاح خام مبعوت (أول إعداد قبل الحفظ)،
  // (2) اختبار بمفتاح محفوظ محدد برقمه — للحقول المعدلة أو لزر اختبار كل مفتاح
  // في كارت المفاتيح. المفتاح المحفوظ لا يخرج من السيرفر أبدًا.
  const savedIdx = typeof body.savedKeyIndex === "number" ? body.savedKeyIndex : null;
  const checked = validateProviderInput(
    savedIdx !== null ? { ...body, apiKeys: ["validation-placeholder-key"] } : body
  );
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const v = checked.value;
  let key: string;
  let displayName = v.name;
  if (savedIdx !== null) {
    const saved = await getSavedModelProvider(modelId);
    if (!saved) {
      return NextResponse.json({ error: "لا يوجد مزوّد محفوظ للموديل — احفظ الإعداد الأول" }, { status: 400 });
    }
    if (!Number.isInteger(savedIdx) || savedIdx < 0 || savedIdx >= saved.apiKeys.length) {
      return NextResponse.json({ error: "المفتاح غير موجود — حدّث الصفحة وحاول تاني" }, { status: 400 });
    }
    key = saved.apiKeys[savedIdx];
    displayName = saved.name;
  } else {
    key = v.apiKeys[0];
  }
  const endpoint = resolveProviderEndpoint(v.baseUrl, v.protocol);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    // نفس بناء الطلب الفعلي (buildUpstreamBody) لكن برسالة اختبار مصغرة وبدون stream
    const testBody =
      v.protocol === "responses"
        ? buildUpstreamBody("responses", {
            model: v.model,
            messages: [{ role: "user", content: "رد بكلمة واحدة: تمام" }],
            temperature: v.temperature,
            maxTokens: 16,
            stream: false,
          })
        : buildUpstreamBody("chat_completions", {
            model: v.model,
            messages: [{ role: "user", content: "رد بكلمة واحدة: تمام" }],
            temperature: v.temperature,
            maxTokens: 10,
            stream: false,
          });
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testBody),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => "");
    // server log تشخيصي بدون المفتاح
    console.error(
      `[MALG provider test] provider="${displayName}" model="${v.model}" protocol=${v.protocol} endpoint=${endpoint} status=${res.status} body=${text.slice(0, 300)}`
    );
    if (res.ok) {
      let sample = "";
      try {
        const json = JSON.parse(text);
        if (v.protocol === "responses") {
          sample = extractResponsesSample(json);
          if (!sample && Array.isArray((json as Record<string, unknown>)?.choices)) {
            sample = String(
              ((json as Record<string, unknown>).choices as Array<Record<string, unknown>>)?.[0]?.message
                ? (((json as Record<string, unknown>).choices as Array<Record<string, unknown>>)[0].message as Record<string, unknown>).content ?? ""
                : ""
            ).slice(0, 200);
          }
        } else {
          sample = String(
            (json as Record<string, unknown>)?.choices
              ? (((json as Record<string, unknown>).choices as Array<Record<string, unknown>>)[0]?.message as Record<string, unknown> | undefined)?.content ?? ""
              : ""
          ).slice(0, 200);
          // بعض البوابات ترجع صيغة responses حتى في وضع chat — حاول استخراجها أيضًا
          if (!sample) sample = extractResponsesSample(json);
        }
      } catch {
        sample = "";
      }
      return NextResponse.json({ ok: true, sample, protocol: v.protocol, endpoint });
    }
    const classified = classifyUpstreamError(res.status, text);
    let hint = "";
    switch (classified.category) {
      case "invalid_api_key":
        hint = "المفتاح مرفوض — راجع الـ API Key";
        break;
      case "forbidden_model":
        hint = "المزوّد رفض النموذج/الصلاحية (403) — قد يكون الموديل غير مسموح لهذا المفتاح أو يحتاج بروتوكولًا مختلفًا، راجع اسم الموديل والبروتوكول";
        break;
      case "wrong_endpoint":
        hint = "الرابط/المسار غلط (404) — راجع الـ Base URL والبروتوكول (Chat يحتاج /chat/completions وResponses يحتاج /responses)";
        break;
      case "unsupported_protocol":
        hint = "البروتوكول غير مدعوم من المزوّد — جرّب تبديل البروتوكول بين Chat Completions وResponses API";
        break;
      case "quota_payment":
        hint = "رصيد المزوّد خلصان (payment/quota)";
        break;
      case "rate_limit":
        hint = "المزوّد مضغوط حاليًا (rate limit) — الإعداد شكله صح، جرّب تاني";
        break;
      case "model_not_found":
        hint = "اسم الموديل مش موجود عند المزوّد ده — راجع اسم الموديل بالظبط";
        break;
      default:
        hint = "";
    }
    return NextResponse.json(
      { ok: false, error: `المزوّد رد بخطأ ${res.status}${hint ? ` — ${hint}` : ""}`, detail: text.slice(0, 500), protocol: v.protocol, endpoint },
      { status: 502 }
    );
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      { ok: false, error: aborted ? "المهلة خلصت — الرابط مش بيرد، راجع الـ Base URL" : "مش قادر أوصل للرابط — راجع الـ Base URL والإنترنت" },
      { status: 502 }
    );
  } finally {
    clearTimeout(timer);
  }
}
