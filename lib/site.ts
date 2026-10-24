/**
 * عنوان الموقع الأساسي (بدون / في الآخر) — بيُستخدم في metadataBase و robots و sitemap.
 * الأولوية: NEXT_PUBLIC_SITE_URL (لو عندك دومين مخصص) ← دومين Vercel الإنتاجي ←
 * RENDER_EXTERNAL_URL (Render بيحطه لوحده) ← localhost للتطوير.
 * مهم للمعاينة على واتساب/تيليجرام: og:image لازم يكون رابط مطلق على دومين حقيقي —
 * لو رجع localhost المنصات مش هتلاقي الصورة والمعاينة هتطلع من غير صورة.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  const render = process.env.RENDER_EXTERNAL_URL?.trim();
  if (render) return render.replace(/\/+$/, "");
  return "http://localhost:3000";
}

/**
 * عنوان الموقع من طلب HTTP الفعلي (الدومين اللي الزائر فاتح منه) — للاستخدام
 * داخل Server Components فقط (مثل مثال الـ curl في الهبوط)، عشان يظهر الدومين
 * الحقيقي (render/onrender أو دومين مخصص) بدل localhost لما المتغير مش متظبط.
 * يقع على getSiteUrl() لو الهيدرز مش متاحة.
 */
export async function getRequestSiteUrl(): Promise<string> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host =
      h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host")?.trim() || "";
    if (host) {
      const proto =
        h.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
        (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  } catch {
    // تجاهل — نرجع للافتراضي تحت
  }
  return getSiteUrl();
}
