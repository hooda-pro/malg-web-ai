import type { Metadata } from "next";
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
