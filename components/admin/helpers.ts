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

/** تاريخ ووقت بالعربي — مثال: ١٢ يناير 2026، ٣:٤٠ م */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", {
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

/** «منذ كذا» — للنشاط الأخير */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months < 12) return `منذ ${months} شهر`;
  return `منذ ${Math.floor(months / 12)} سنة`;
}

/** نسبة الاستهلاك من إجمالي الرصيد (0-100) */
export function usagePercent(used: number, total: number): number {
  if (!total || total <= 0) return 0;
  return Math.min(Math.round((used / total) * 100), 100);
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