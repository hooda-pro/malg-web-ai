import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://malg.ai").replace(/\/$/, "");
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/#features`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/#api`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/#/api`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];
}
