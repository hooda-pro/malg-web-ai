# CHANGELOG — تنفيذ المراجعة التقنية (v14)

اتنفّذ من المراجعة بس النقاط اللي اتأكدت من الكود إنها حقيقية وتتصلّح بأمان. باقي النقاط
(Landing, Privacy/Terms, Sentry, OG image, SSR للغة, Share/Export) فيها قرارات منتج/تصميم وسايبينها لك.

## أمان (أولوية عالية)

1. **Login rate limit كان in-memory** → بقى `checkRateLimitShared` (Postgres، جدول `rate_limits`).
   - upsert ذرّي بجملة SQL واحدة: مفيش سباق بين طلبين متوازيين، ومشترك بين كل نسخ serverless.
   - لو الداتابيز فشلت لحظيًا بيرجع للـ in-memory القديم كخطة بديلة (مش بيفتح المسار من غير حماية).
   - اتطبّق على: `/api/auth/login` (IP + email) و `/api/malg/v1/chat/completions` (لكل مفتاح API).
   - الجدول بيتعمل تلقائيًا في `ensureSchema()` — مفيش migration يدوي.
2. **`/api/chat/continue` من غير rate limit** → `checkContinueRate` (5 في الدقيقة، 30 في الساعة لكل مستخدم،
   الأدمن مستثنى، نفس منطق /api/chat). بيرد 429 + `Retry-After` بنفس شكل رسالة الخطأ اللي الواجهة بتعرضها.
3. **`getUserFlags` fail-open** → بيرجع `null` لو الاستعلام فشل، و `/api/chat` و `/api/chat/continue`
   و `/api/quota` بيرفضوا بـ 503 + `Retry-After` بدل ما يعاملوا المستخدم كأنه مش محظور.
   (`isUserBanned` في `lib/auth.ts` مش مستخدمة في أي مكان، بس اتغيرت لنفس الفكرة: الخطأ بيوصل للمستدعي.)
4. **Admin APIs**: اتراجعت — كل handlers في `app/api/admin/**` (10 handlers في 8 ملفات) بتنادي `requireAdmin()`،
   وده بيتأكد من الداتابيز في كل طلب ويفشل مقفول. مفيش تغيير مطلوب.
5. **مسارات استهلاك الموارد**: اتراجعت — المسارات اللي بتوصل للموديل/E2B/البحث 3 بس:
   `/api/chat`, `/api/chat/continue`, `/api/malg/v1/chat/completions`، وكلهم دلوقتي عليهم حد + فحص حظر + رصيد.

## تحسينات (أولوية متوسطة)

- `app/robots.ts` و `app/sitemap.ts` و `metadataBase` في `layout.tsx` (عنوان الموقع من `lib/site.ts`).
- `app/loading.tsx` و `app/error.tsx`.
- إصلاح صغير في `lib/db.ts`: لو `ensureSchema()` فشلت مرة (انقطاع لحظي) كان الـ promise الفاشل بيتخزّن
  وكل طلب بعده على نفس النسخة يفشل لحد إعادة التشغيل. دلوقتي بيتفضّى ويتعاد المحاولة.

## محتاج منك

- ضيف `NEXT_PUBLIC_SITE_URL=https://دومينك` في Vercel (من غيره بيستخدم دومين Vercel الإنتاجي تلقائيًا).
- OG image: ضيف `app/opengraph-image.png` (1200×630) وNext هيربطه تلقائيًا.

## اتراجع وطلع سليم (مفيش تعديل)

`not-found.tsx` موجود، favicon موجود (`app/icon.svg`)، Open Graph الأساسي موجود،
`agentRules: false` خيار حقيقي في Next 16.3.3 (موجود في config schema بتاعه)، والـExport موجود (JSON).

## صفحة الهبوط (v15)

- `/` للزائر غير المسجّل بيعرض `components/Landing.tsx` (مرسومة على السيرفر فبتظهر لجوجل)، والمسجّل دخول بيروح للشات مباشرة.
- أي رابط hash حقيقي (`/#/chat` و`/#/api` و`/#/admin`) بيفتح التطبيق زي الأول — `components/HomeGate.tsx`.
- من غير قسم أسعار عن قصد: نظام الاشتراكات مش موجود في الكود لسه.
- المحتوى كله عربي وبيعتمد على ألوان التصميم الحالية (فاتح/داكن تلقائي).
