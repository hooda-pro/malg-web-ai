import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Cairo } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "mlag AI — المساعد الذكي",
  description:
    "مساعد ذكاء اصطناعي متطور من mlag: شات فوري، بيئة تشغيل كود، وتخزين محادثات آمن.",
  // بيخلي زرار "إضافة للشاشة الرئيسية" على آيفون يفتح الموقع بشكل شبه-app
  // (من غير شريط سفاري) بدل ما يفتحه في تاب متصفح عادي.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "mlag AI",
  },
};

// كان ناقص viewport export خالص. من غيره:
// 1) iOS Safari بيحسب الارتفاع كـ 100vh شامل شريط العنوان، فالواجهة كانت
//    ممكن تتقص من تحت أو يبان سكرول مش مطلوب.
// 2) مفيش viewport-fit=cover، يعني safe-area-inset-* (المساحة حوالين
//    الـ notch وخط الهوم في آيفون) كانت بترجع صفر دايمًا حتى لو استخدمناها
//    في الـ CSS.
// 3) themeColor بيظبط لون شريط الحالة/العنوان في المتصفح ليناسب تصميم
//    الموقع الغامق بدل اللون الأبيض الافتراضي.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050706",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${jetbrainsMono.variable} ${cairo.variable}`}>
      <body className="font-arabic-text antialiased min-h-screen">
        <div className="scanline-overlay" />
        {children}
      </body>
    </html>
  );
}
