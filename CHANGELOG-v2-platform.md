# سجل تغييرات منصة v2 — PWA والأوفلاين والتحليلات والطباعة

## الملفات الجديدة
- `public/manifest.webmanifest` — ملف PWA (الاسم MALG AI، عربي RTL، ألوان العلامة).
- `public/sw.js` — عامل الخدمة: كاش `malg-v1`، تخزين مسبق (`/`، `/offline`، `/logo.png`، `/icon.png`)، تنقّل network-first مع رجوع لصفحة الأوفلاين، والأصول الثابتة cache-first.
- `app/offline/page.tsx` — صفحة أوفلاين عربية ("أنت غير متصل") مع زر العودة للرئيسية.
- `components/Analytics.tsx` — تحليلات اختيارية (PostHog / Umami) بدون اعتمادات جديدة، مع تتبع تغيّر الهاش لمسارات `#/`.
- `components/ServiceWorkerRegister.tsx` — تسجيل `sw.js` في الإنتاج فقط.
- `app/print.css` — قواعد الطباعة: إخفاء العلوي والدرج واللوحة والصندوق والحوارات، وإظهار الرسائل أسود على أبيض دون كسر.

## ملفات معدّلة
- `.env.example` — إضافة كتلة اختيارية معلّقة (Stripe للمدفوعات لاحقاً + مفاتيح التحليلات) مع ملاحظة عربية أن الأسرار تبقى server-side.

## خطوة الربط في `app/layout.tsx` (لم تُعدّل — الصق يدوياً)
```tsx
import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";
import "./mobile.css";
import "./print.css";
import Analytics from "@/components/Analytics";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// ... الخطوط كما هي ...

export const metadata: Metadata = {
  // ... الحقول الحالية كما هي ...
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MALG AI", statusBarStyle: "default" },
};

// ... viewport و THEME_BOOTSTRAP كما هي ...

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html /* ... كما هو ... */>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="h-full min-h-[100dvh] antialiased">
        {/* ... المحتوى الحالي ... */}
        {children}
        <Analytics />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
```

## ملاحظات
- صنف `no-print` متاح لأي عنصر يُراد إخفاؤه عند الطباعة — أضفه كمحدد CSS فقط دون تعديل المكونات.
- ملف `sw.js` يُقدَّم من جذر الموقع (`/sw.js`) لأن Next يقدّم مجلد `public/` من الجذر افتراضياً.
