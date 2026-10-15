import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";
import "./mobile.css";
import "./landing.css";
import "./print.css";
import Analytics from "@/components/Analytics";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

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

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: { default: "MALG AI", template: "%s | MALG AI" },
  description:
    "MALG AI — مساعد ذكي يكتب ويبني ويشغّل الكود بجانبك: شات فوري، معاينة حيّة للمشاريع، بيئة تشغيل كود، ومحادثات محفوظة.",
  applicationName: "MALG AI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MALG AI", statusBarStyle: "default" },
  keywords: [
    "MALG",
    "MALG AI",
    "مساعد ذكي",
    "ذكاء اصطناعي",
    "شات",
    "مساعد برمجة",
    "كتابة الكود",
    "معاينة حية",
    "واجهة API",
    "AI",
    "chat",
    "coding assistant",
    "artifacts",
  ],
  openGraph: {
    title: "MALG AI",
    description: "مساعد ذكي للمبرمجين: شات فوري، معاينة حيّة للمشاريع، وبيئة تشغيل كود.",
    type: "website",
    siteName: "MALG AI",
  },
  twitter: {
    card: "summary_large_image",
    title: "MALG AI",
    description: "مساعد ذكي للمبرمجين: شات فوري، معاينة حيّة للمشاريع، وبيئة تشغيل كود.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f3ed" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

/** Applies the stored theme before first paint so there is never a flash. */
const THEME_BOOTSTRAP = `(function(){var d=document.documentElement;try{var r=localStorage.getItem("mlag-settings");var t=r?JSON.parse(r).theme:null;if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}d.setAttribute("data-theme",t);d.style.backgroundColor=t==="dark"?"#09090b":"#f4f3ed";}catch(e){d.setAttribute("data-theme","light");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      data-theme="light"
      className={`${plexArabic.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="h-full min-h-[100dvh] antialiased">
        <a href="#mlag-main" className="skip-link">
          تخطَّ إلى المحتوى
        </a>
        <div className="grain" aria-hidden="true" />
        {children}
        <Analytics />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
