import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

// التطبيق حاليًا صفحة واحدة (الراوتر بالـ hash)، فالـ sitemap فيه الرئيسية بس.
// ضيف هنا أي صفحات حقيقية جديدة (landing, privacy, terms...) لما تتعمل.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${getSiteUrl()}/`, changeFrequency: "weekly", priority: 1 }];
}
