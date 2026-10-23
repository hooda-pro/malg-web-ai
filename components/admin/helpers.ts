import { formatTokens } from "@/lib/ai";

/** تاريخ قصير بالعربي — مثال: ١٢ يناير 2026 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/** تاريخ ووقت — اللغة اختيارية (افتراضي العربي للأدمن). مثال: ١٢ يناير 2026، ٣:٤٠ م */
const LOCALE_BY_LANG: Record<string, string> = {
  ar: "ar-EG",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
};

export function formatDateTime(iso: string | null | undefined, lang?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(LOCALE_BY_LANG[lang || "ar"] || "ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** «منذ كذا» — للنشاط الأخير. اللغة اختيارية (افتراضي العربي للأدمن). */
export function timeAgo(iso: string | null | undefined, lang?: string): string {
  if (!iso) return "—";
  const locale = LOCALE_BY_LANG[lang || "ar"] || "ar-EG";
  const ms = Date.now() - new Date(iso).getTime();
  const now =
    locale.startsWith("en") ? "just now"
    : locale.startsWith("fr") ? "à l'instant"
    : locale.startsWith("es") ? "ahora"
    : "الآن";
  if (ms < 60_000) return now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "long" });
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return rtf.format(-days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return rtf.format(-months, "month");
  return rtf.format(-Math.floor(months / 12), "year");
}

/** نسبة الاستهلاك من إجمالي الرصيد (0-100) */
export function usagePercent(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(Math.round((used / total) * 100), 100);
}

/** عرض سعر بالدولار من micro-dollar: 4 → "4"، 150000 → "0.15" (من غير أصفار زيادة) */
export function fmtPrice(micro: number | null | undefined): string {
  const usd = Math.max(Number(micro) || 0, 0) / 1_000_000;
  if (usd === 0) return "0";
  return usd >= 0.01 ? String(Math.round(usd * 100) / 100) : String(Math.round(usd * 1000) / 1000);
}

export { formatTokens };

/** أول حرف من الاسم للـ avatar */
export function initialOf(name: string | null | undefined): string {
  return (name || "؟").trim().charAt(0).toUpperCase();
}

/** قص النص الطويل للعرض */
export function truncate(text: string, max = 140): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}