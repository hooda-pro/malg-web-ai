import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

// الصفحات الحقيقية: الرئيسية + الباقات + النماذج + الخصوصية + الشروط.
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/models`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.4 },
  ];
}
