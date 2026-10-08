/**
 * عنوان الموقع الأساسي (بدون / في الآخر) — بيُستخدم في metadataBase و robots و sitemap.
 * الأولوية: NEXT_PUBLIC_SITE_URL (لو عندك دومين مخصص) ← دومين Vercel الإنتاجي ← localhost للتطوير.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}
