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

export const metadata: Metadata = {
  title: "mlag AI",
  description:
    "mlag AI — مساعد ذكي يكتب ويبني ويشغّل الكود جنبك: شات فوري، معاينة حيّة للمشاريع، بيئة تشغيل كود، ومحادثات محفوظة.",
  applicationName: "mlag AI",
  keywords: ["mlag", "AI", "chat", "coding assistant", "artifacts", "code runner"],
  openGraph: {
    title: "mlag AI",
    description: "مساعد ذكي للمبرمجين: شات فوري، معاينة حيّة للمشاريع، وبيئة تشغيل كود.",
    type: "website",
    siteName: "mlag AI",
  },
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

/** Applies the stored theme before first paint so there is never a flash. */
const THEME_BOOTSTRAP = `(function(){try{var r=localStorage.getItem("mlag-settings");var t=r?JSON.parse(r).theme:null;if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

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
      </body>
    </html>
  );
}
