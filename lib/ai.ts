import { MODEL_GLM_45_FLASH, MODEL_GLM_47_FLASH } from "./systemPrompt";

const BASE_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

export interface ApiMessage {
  role: string;
  content: string;
}

export function parseErrorMessage(httpCode: number, rawJson: string): string {
  try {
    if (rawJson.includes("1302") || rawJson.includes("速率限制")) {
      return "تم الوصول لمعدل الطلبات المسموح (Rate Limit): النموذج المجاني GLM-4.7-Flash يتيح طلباً واحداً متزامناً (1 Concurrency). يُرجى الانتظار 2-3 ثوانٍ فقط وإعادة المحاولة وسيعمل فوراً!";
    }
    if (rawJson.includes("1113") || rawJson.includes("余额不足")) {
      return "خطأ 1113 (رصيد الحساب): تم اختيار نموذج مدفوع يحتاج رصيداً. يرجى اختيار النموذج المجاني GLM-4.7-Flash.";
    }
    if (rawJson.includes("1211") || rawJson.includes("模型不存在")) {
      return "خطأ 1211: كود النموذج غير صالح. استخدم النموذج المجاني GLM-4.7-Flash.";
    }
    if (
      rawJson.includes("1001") ||
      rawJson.includes("1002") ||
      rawJson.includes("未收到Authorization")
    ) {
      return "خطأ في مفتاح API: المفتاح المدخل غير مصرح به أو تم إلغاؤه من المنصة.";
    }
    if (rawJson.includes("1301") || rawJson.includes("并发")) {
      return "خطأ ضغط على السيرفر (Concurrency Limit): يُرجى الانتظار ثانية واحدة وإعادة الإرسال.";
    }
    return `خطأ من الخادم (${httpCode}): ${rawJson.slice(0, 300)}`;
  } catch {
    return `خطأ في الاتصال بالخادم (${httpCode})`;
  }
}

/** تقدير تقريبي لعدد التوكنز (نفس منطق ChatRepository.estimateTokens في تطبيق الأندرويد). */
export function estimateTokens(...texts: (string | null | undefined)[]): number {
  const sum = texts.reduce((acc, t) => acc + Math.floor((t?.length ?? 0) / 3), 0);
  return sum + 10;
}

export function formatTokens(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type NegotiationResult =
  | { ok: true; response: Response }
  | { ok: false; errorMessage: string };

/**
 * يجرب الاتصال بموديل mlag (GLM) بنفس منطق إعادة المحاولة والتراجع
 * (fallback) الموجود في ApiClient.kt / ChatRepository.kt الأصلي:
 * 1) الموديل المختار + أدوات البحث على الإنترنت
 * 2) لو 429 ينتظر 1.5 ثانية ويعيد المحاولة
 * 3) لو فشل، يعيد المحاولة بدون tools
 * 4) لو لسه فاشل، يجرب الموديل المجاني الاحتياطي glm-4.5-flash بدون tools
 */
export async function negotiateUpstream(
  apiMessages: ApiMessage[],
  signal: AbortSignal
): Promise<NegotiationResult> {
  const apiKey = process.env.MLAG_API_KEY || "";
  const model = process.env.MLAG_MODEL?.trim() || MODEL_GLM_47_FLASH;

  const tools = [
    { type: "web_search", web_search: { enable: true, search_result: true } },
  ];

  const buildBody = (m: string, useTools: boolean) =>
    JSON.stringify({
      model: m,
      messages: apiMessages,
      temperature: 0.7,
      max_tokens: 96000,
      stream: true,
      ...(useTools ? { tools } : {}),
    });

  const call = (m: string, useTools: boolean) =>
    fetch(BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: buildBody(m, useTools),
      signal,
    });

  let response: Response;
  try {
    response = await call(model, true);
  } catch (e) {
    if (signal.aborted) throw e;
    return { ok: false, errorMessage: "تعذر الاتصال بخادم mlag، تأكد من اتصالك بالإنترنت وحاول تاني." };
  }

  if (response.status === 429) {
    await sleep(1500);
    try {
      response = await call(model, true);
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }

  if (!response.ok) {
    try {
      const retryResp = await call(model, false);
      if (retryResp.ok) response = retryResp;
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }

  if (!response.ok && model !== MODEL_GLM_45_FLASH) {
    try {
      const fallbackResp = await call(MODEL_GLM_45_FLASH, false);
      if (fallbackResp.ok) response = fallbackResp;
    } catch (e) {
      if (signal.aborted) throw e;
    }
  }

  if (!response.ok) {
    let rawError = "";
    try {
      rawError = await response.text();
    } catch {
      // تجاهل
    }
    return { ok: false, errorMessage: parseErrorMessage(response.status, rawError) };
  }

  return { ok: true, response };
}
