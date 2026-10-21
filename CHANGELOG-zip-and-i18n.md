# CHANGELOG — حظر الملفات المضغوطة + ترجمة الصفحات اللي كان نصها ثابت

## 1) حظر رفع الأرشيفات المضغوطة (ZIP/RAR/7z...) فورًا

- `lib/attachments.ts`: دالة جديدة `isArchiveFile(file)` تفحص الامتداد
  (zip, rar, 7z, tar, gz, tgz, bz2, xz, zst, iso, cab, pkg) والـMIME
  (application/zip, x-zip-compressed, vnd.rar, x-7z-compressed, x-tar, gzip...).
- `components/BottomInputBar.tsx` → `addFiles`: الحظر يتم قبل أي معالجة —
  الملف المضغوط مش بيتحوّل chip ولا بيتروح للسيرفر خالص، بدل ذلك يظهر كارت
  إشعار أنيق فوق خانة الكتابة (بدل الرسالة الشفافة القديمة اللي المستخدم مبتحبهاش).
- الكارت: خلفية `accent-soft` + إطار `accent-line` + شريحة أيقونة `FileArchive`
  في مربع rounded خلفيته `accent` + زر إغلاق صريح، ومن غير حجب لأي حاجة تانية.
- نص الإشعار (بطلب المستخدم): «لا يمكنك رفع ملف ZIP هنا» + توجيه إن المطور
  يستخدم مفتاح الـAPI ويربطه بأدوات CLI زي **Claude Code** (بالإنجليزية)،
  أو يفكّ الضغط ويرفع الملفات النصية عادي — مترجم للأربع اللغات
  (مفاتيح `zipBlockedTitle` / `zipBlockedBody`).
- كمان الرسائل اللي كانت عربي ثابت جوه الـchips اتترجمت: «الملف كبير جدًا»
  (`attachTooBig`)، «رفع الفيديو متوقف حاليًا» (`attachVideoPaused`)،
  و«تعذّر رفع الملف» (`attachUploadFail`).

## 2) ترجمة الصفحات اللي كانت نصها عربي ثابت

السكوب: الصفحات اللي بيشوفها المستخدم العادي. صفحات الأدمن (admin/*) واجهة
داخلية بالعربي — تقدر تتترجم في خطوة تالية لو احتجت.

### صفحة API للمطورين (`ApiKeysPage.tsx`)
كانت `dir="rtl" lang="ar"` مكتوبة يدوي — فما كانتش بتتأثر من لغة الموقع أبدًا. الان:
- الاتجاه واللغة دينامكيين من `useSettings().lang`
  (`dir={lang === "ar" ? "rtl" : "ltr"}` و`lang={lang}`).
- حوالي 50 نص ثابت بقوا مفاتيح `ak*` في `lib/i18n.ts` (ar/en/fr/es):
  العناوين، الأوصاف، شاشات إنشاء/حفظ/إلغاء المفتاح، رسائل الأخطاء، الشحن
  والأسعار، وتعليقات أمثلة الربط (cURL/Python/JS/Cline/OpenCode/Codex/Claude Code).
- `formatDateTime` / `timeAgo` في `admin/helpers.ts` بقت تقبل معامل لغة
  اختياري (الافتراضي العربي زي ما الأدمن شايف) — وصفحة API تمرر لغة الموقع،
  فـ«منذ 3 ساعات» بقت «3 hours ago» / «il y a 3 heures» / «hace 3 horas».
- واحد `<مفتاحك>` جوه نموذج Cline اتترجم (`akClineKeyPlaceholder`).

### الهيرو والـFAQ والفوتر (الـLanding)
- `HeroComposer.tsx`: أسماء الأوضاع الأربعة + 12 مثال من المفاتيح `hcp*`
  بتترجم وقت الرندر، والـtypewriter بيبدأ بلغة الموقع (وأمثلة مترجمة
  بـ`useMemo` عشان مرجع الダイنماية متبقاش متغير كل رندر).
- `FaqSection.tsx`: 6 أسئلة وأجوبة كمفاتيح `faq*` + eyebrow + عنوان،
  والـقسم بياخد `dir` دينامكي.
- `LandingFooter.tsx`: عناوين الأعمدة + 9 لينكات + التاجلاين والحقوق بمفاتيح `foot*`.
- `Landing.tsx` (سيرفر كومبوننت): الهيرو بقى كومبوننت عميل `HeroCopy.tsx`
  (بادج «جديد» + العنوان + الوصف + سطر «مجاني للبدء») — للماركي كومبوننت
  عميل `MarqueeRow.tsx` بالـaria-label والـ10 قدرات `mq*` — وعنوان
  sr-only «شاهد MALG أثناء العمل» بقى `ShowcaseTitle.tsx`.

## الجاي (اقتراح)
- صفحات الأدمن (AdminProvider/AdminPanel/UserDetail/Search...) — عربي بس حاليًا.
- أي نصوص متفرقة صغيرة متبقية في PricingSection/DeveloperSection/Showcase
  لو ظهرت في المراجعة.
