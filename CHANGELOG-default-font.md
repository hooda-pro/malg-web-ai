# CHANGELOG — زر إعادة التوليد أيقونة بس + إرجاع الخط الافتراضي

## 1) زر إعادة توليد الرد — علامة بس، من غير نص
- `components/MessageItem.tsx`: زر إعادة التوليد (اللي بيظهر على آخر رد
  بعد ما النموذج يخلص) بقى **أيقونة بس** (RefreshCw 13px) — النص المكتوب
  عليه (`t("regenerate")` / `t("regenerating")`) اتشال من واجهة الزر.
- التصميم بقى نفس نمط أزرار التقييم (👍 👎) المجاورة: دائرة `h-7 w-7`
  بنفس الألوان والهوفر.
- الـtooltip عند الوقوف على الزر فضل شغال (عبر `title`) وأيضًا
  `aria-label` لقارئات الشاشة — فالمفاتيح `regenerate` / `regenerating`
  فضلت مستخدمة (متشالوش من `lib/i18n.ts`).

## 2) إرجاع الخط الافتراضي — بدون أي خط مضاف
اتشال أي خط مضاف (IBM Plex Sans Arabic + JetBrains Mono من Google) وردّ
الموقع على خط النظام الافتراضي.
- `app/layout.tsx`: استيراد `next/font/google` + الثوابت `plexArabic` /
  `jetbrainsMono` + الـclassName بتاع `<html>` — كلهم اتشالوا.
- `app/globals.css`: التعريفات `--font-latin` / `--font-arabic` /
  `--font-mono` من `:root` اتحذت، وقاعدة `body { font-family:
  var(--font-latin) }` وقاعدة `html[lang="ar"] body { font-family:
  var(--font-arabic) }` اتشالوا — فمفيش أي `font-family` مخصص في أي مكان.
- `tailwind.config.ts`: كتلة `fontFamily` (sans/arabic/mono) اتحذت —
  `font-mono` / `font-sans` رجعوا تنصيف Tailwind الافتراضي (خطوط النظام:
  ui-sans-serif / ui-monospace...) فكل المكونات (code blocks،
  ArtifactPanel، صفحة API...) فضلت شغالة من غير أي تعديل عليها.
- تحسينات عرض النص (font-smoothing / text-rendering) فضلت زي ما هي — دي
  مش خط، دي جودة عرض بس.

## ملحوظات
- زر النسخ (📋 + كلمة «نسخ») فضل زي ما هو — الطلب كان عن زر إعادة التوليد بس.
- خطوط next/font كانت بتضاف كملفات مع البيلد — نشالت خالص دلوقتي، فالموقع
  ماعدهوش أصول خطوط داخله أصلًا.
