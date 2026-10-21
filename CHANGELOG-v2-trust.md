# سجل التغييرات — الثقة والهوية (v2-trust)

توحيد لون العلامة، تحسين التباين، إتاحة الوصول، وصفحات حقيقية للثقة.

## 1. توحيد لون العلامة (terracotta)
- `app/globals.css` — ثيم `[data-theme="dark"]`: `--accent` أصبح `#d97757`، و`--accent-hover` أصبح `#e0855f`، و`--accent-soft` أصبح `rgba(217,119,87,.16)`، و`--accent-line` أصبح `rgba(217,119,87,.4)`، مع بقاء `--accent-ink` أبيض.
- `app/globals.css` — زر الإرسال الداكن أصبح `linear-gradient(135deg,#c15f3c,#d97757)`، وتوهجات `aurora` الداكنة انتقلت من الأزرق لعائلة الـ terracotta.
- `app/globals.css` — كلاس `.text-gradient` كان يستخدم `#0090ff` فأصبح يستخدم `var(--accent-hover)`، ونسخته الداكنة أصبحت تستخدم توكنات `--accent` بدل الأزرق المكتوب يدويًا.
- الثيم الفاتح لم يُمس.

## 2. التباين
- `app/globals.css` — `--ink-3` الفاتح من `#9b9893` إلى `#6f6c68`، والداكن من `#71717a` إلى `#8e8e96`.
- `app/mobile.css` — تحديث تجاوزات `--ink-3` بنفس القيم الجديدة (فاتح `#6f6c68` / داكن `#8e8e96`).

## 3. إتاحة الوصول
- `components/TopBar.tsx` — زر حلقة التوكنز (أيقونة فقط، كان `title` بلا `aria-label`) أُضيف له `aria-label` عربي.
- `components/MessageItem.tsx` — زرا النسخ وإعادة التوليد في صف المساعد أُضيف لهما `aria-label`.
- `components/BottomInputBar.tsx` — زر إزالة المرفق أُضيف له `title` ليطابق `aria-label` الموجود؛ بقية الأزرار كانت سليمة.
- `components/ChatDrawer.tsx` و`components/ArtifactPanel.tsx` — كل الأزرار الأيقونية كانت تحمل `aria-label` عربيًا بالفعل (عبر `IconButton label` أو `t()`)، فلا تغيير لازم.
- `components/Toast.tsx` — زر الإغلاق كان `label="Close"` إنجليزيًا فأصبح `"إغلاق"`.
- `components/Logo.tsx` — `alt=""` أصبح `alt="MALG"` (مع إزالة `aria-hidden` المتعارض مع وجود نص بديل).
- `app/globals.css` — مدة `.toast-drain` من `4.5s` إلى `6s`.
- `app/globals.css` — تأخيرات `.stagger` امتدت لتغطي 12 عنصرًا (حتى `660ms`).
- `app/globals.css` + `components/Landing.tsx` — أنيميشن فتح الأسئلة الشائعة: كلاس `.faq-details` على `details` و`.faq-body` (انتقال `grid-rows 0fr→1fr` مع شفافية) حول نص الإجابة.

## 4. البيانات الوصفية وصورة المشاركة
- `app/layout.tsx` — العنوان أصبح `{default:"MALG AI", template:"%s | MALG AI"}`، ومصفوفة `keywords` عربية، وقسم `twitter` (`summary_large_image` + العنوان والوصف)، مع بقاء `openGraph`.
- `app/opengraph-image.tsx` (جديد) — `ImageResponse` من `next/og` بمقاس `1200×630` ونوع `image/png`: خلفية `#09090b` داكنة، لمسات `#d97757`، عنوان لاتيني كبير `MALG AI` + سطر إنجليزي فرعي + حبات (Streaming / Live preview / API)، وبلا أي نص عربي داخل الصورة.

## 5. صفحات حقيقية (محتوى عربي + `metadata` عربي + رابط عودة)
- `app/privacy/page.tsx` (جديد) — البيانات المخزنة (اسم/بريد Google، المحادثات على Neon Postgres، لا بيانات بطاقات — الشحن اليدوي عبر واتساب)، والتواصل والحذف عبر تبويب «البيانات» في الإعدادات.
- `app/terms/page.tsx` (جديد) — الاستخدام المقبول، الحصص، لا ضمان، إساءة الاستخدام/الحظر، حذف الحساب.
- `app/pricing/page.tsx` (جديد) — الأرقام مطابقة لـ `lib/plans.ts` و`lib/recharge.ts`: مجاني (25,000 توكن، $0) / Pro (20M توكن، $25 شهريًا و$250 سنويًا) / باقات الشحن الأربع + زر واتساب `https://wa.me/x9_vk` + ملحوظة أن الدفع المباشر بالبطاقة قادم لاحقًا.

## 6. خريطة الموقع وتذييل اللاندنج
- `app/sitemap.ts` — يشمل `/` و`/pricing` و`/privacy` و`/terms`.
- `components/Landing.tsx` — روابط التذييل أُضيفت: `/pricing` (الباقات) و`/privacy` (الخصوصية) و`/terms` (الشروط).

## ملفات مملوكة لهذه المهمة فقط
`app/globals.css`، `app/layout.tsx`، `app/sitemap.ts`، `app/opengraph-image.tsx`، `app/privacy/page.tsx`، `app/terms/page.tsx`، `app/pricing/page.tsx`، `components/TopBar.tsx`، `components/ChatDrawer.tsx`، `components/MessageItem.tsx`، `components/BottomInputBar.tsx`، `components/Toast.tsx`، `components/Logo.tsx`، `components/ArtifactPanel.tsx`، `components/Landing.tsx` (روابط التذييل + كلاسات FAQ فقط)، `app/mobile.css` (تجاوز `--ink-3` فقط).
