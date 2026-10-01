import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-plex",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://malg.ai";
const SITE_TITLE = "MALG AI — مساعدك الذكي للبرمجة والبناء";
const SITE_DESC =
  "MALG AI — مساعد ذكي يكتب ويبني ويشغّل الكود جنبك: شات فوري، معاينة حيّة للمشاريع، بيئة تشغيل كود، بحث حقيقي على الإنترنت، ومحادثات محفوظة — و API كامل للاستخدام الاحترافي في Cline و OpenCode وغيرهم.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: "%s | MALG AI" },
  description: SITE_DESC,
  applicationName: "MALG AI",
  keywords: ["MALG", "MALG AI", "Malg-A3", "AI chat", "coding assistant", "artifacts", "E2B", "Cline", "ذكاء اصطناعي", "مساعد برمجة"],
  authors: [{ name: "MALG Team" }],
  creator: "MALG",
  publisher: "MALG",
  formatDetection: { email: false, address: false, telephone: false },
  alternates: { canonical: "/" },
  openGraph: {
    title: SITE_TITLE,
    description: "شات فوري + معاينة حيّة + تشغيل كود + بحث حقيقي. و API كامل للاستخدام الاحترافي.",
    url: SITE_URL,
    siteName: "MALG AI",
    type: "website",
    locale: "ar_EG",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "MALG AI - مساعدك الذكي للبرمجة" }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: "مساعد ذكي يبني مواقع وتطبيقات جنبك — معاينة حيّة وتشغيل كود حقيقي.",
    images: ["/og-image.png"],
  },
  icons: { icon: "/favicon.ico", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0c" },
  ],
};

const THEME_BOOTSTRAP = `(function(){try{var r=localStorage.getItem("mlag-settings");var t=r?JSON.parse(r).theme:null;if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-theme="light" className={`${plexArabic.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="h-full min-h-[100dvh] antialiased">
        <a href="#mlag-main" className="skip-link">تخطَّ إلى المحتوى</a>
        <div className="grain" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
