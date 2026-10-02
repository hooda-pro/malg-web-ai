import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const site = getSiteUrl();
  return {
    // مسارات الـ API مش للأرشفة. ملحوظة: لوحة الأدمن على /#/admin والـ hash مبيوصلش للسيرفر،
    // فمش ممكن تتحجب من هنا — حمايتها الفعلية على مستوى الـ API (requireAdmin).
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
