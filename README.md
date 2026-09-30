# mlag AI — النسخة الويب

نسخة موقع كاملة (Next.js) من تطبيق mlag AI الأصلي، بنفس الشخصية والمميزات:
شات فوري مع بث الرد لحظة بلحظة، بحث على الإنترنت، كروت ملفات/مشاريع قابلة للتحميل،
بيئة تشغيل كود (HTML/CSS/JS)، نظام حسابات وتوكنز، وتخزين حقيقي لكل حاجة على قاعدة بيانات Neon.

الشكل اتغيّر بالكامل لواجهة **Apple Liquid Glass × Vercel**: خلفية رمادي فاتح،
أسطح بيضاء موحّدة بخطوط شعرية (hairlines) بينها، لون واحد بس للتأكيد (أزرق النظام)،
والزجاج (backdrop blur) متستخدم في الطبقات اللي فوق بعض فعليًا بس — نافبار، شيت القوايم،
ومودالات. المونو بقى محجوز للكود فقط، والعربي على IBM Plex Sans Arabic، واللاتيني على
خطوط النظام (SF / Segoe). والواجهة فيها **سمة فاتحة وداكنة** بتتبدل من النافبار أو الإعدادات.

## المتغيرات المطلوبة (Environment Variables)

انسخ `.env.example` باسم `.env.local` (محليًا) أو ضيفهم في Vercel Project Settings:

| المتغير | الوصف |
|---|---|
| `DATABASE_URL` | رابط الاتصال بقاعدة بيانات Neon (Postgres) |
| `JWT_SECRET` | نص عشوائي طويل وسري لتوقيع جلسات الدخول |
| `TOKENHARBOR_API_KEY` | مفتاح API بتاع Token Harbor (من tokenharbor.ai) — الموديل شغال على `deepseek-v4.1-flash:free` |
| `TOKENHARBOR_API_KEYS` أو `TOKENHARBOR_API_KEYS1`/`2`/... | (اختياري) أكتر من مفتاح Token Harbor للتدوير بينهم لو حابب |
| `ADMIN_EMAIL` | إيميل حساب الأدمن الافتراضي (بيتعمل تلقائيًا أول مرة) |
| `ADMIN_PASSWORD` | باسورد حساب الأدمن (12 حرف على الأقل) — تسجيل دخول الأدمن بس، مش المستخدمين العاديين |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | من Firebase Console > Project settings > Web app |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | نفس المكان فوق |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | نفس المكان فوق |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | نفس المكان فوق |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | نفس المكان فوق |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | نفس المكان فوق |
| `FIREBASE_PROJECT_ID` | من ملف Service Account (Firebase Console > Service accounts) |
| `FIREBASE_CLIENT_EMAIL` | نفس ملف الـ Service Account |
| `FIREBASE_PRIVATE_KEY` | نفس ملف الـ Service Account — خلي الأسطر الجديدة `\n` زي ما هي |
| `E2B_API_KEY` | (اختياري) مفتاح [E2B](https://e2b.dev) — لو متظبط، بيتفعّل تنفيذ أوامر حقيقي (`run_command`) جوه sandbox حقيقي أثناء الشات. لو مش متظبط، الميزة دي بتتعطل بنظافة والموديل عمره ما يستخدمها. |
| `E2B_TEMPLATE` / `E2B_SANDBOX_MEMORY_MB` | (اختياريين) اسم template مخصص للـ sandbox ورامه بالميجابايت. الافتراضي 512MB وده ضعيف على `npm install` لمشاريع Next — شوف `e2b-template/README.md`. |

> تسجيل حساب جديد للمستخدمين العاديين بقى عن طريق Google فقط (لازم تفعّل Google
> Sign-In في Firebase Console > Authentication > Sign-in method). حساب الأدمن لوحده
> بيسجل دخول بإيميل/باسورد عادي من `/#/admin`.

الجداول بتتنشئ تلقائيًا في أول طلب يوصل للسيرفر (مفيش سكريبت لازم تشغّله يدويًا).

## التشغيل محليًا

```bash
npm install
npm run dev
```

افتح `http://localhost:3000`.

## النشر: GitHub + Vercel + Neon

### 1) إنشاء قاعدة بيانات Neon
1. روح على [neon.tech](https://neon.tech) واعمل مشروع جديد.
2. من الـ Dashboard انسخ الـ **Connection String** (بيبدأ بـ `postgres://...`).
3. حطه في متغير `DATABASE_URL`.

### 2) رفع الكود على GitHub
```bash
git init
git add .
git commit -m "mlag AI web"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

### 3) الربط مع Vercel
1. روح [vercel.com](https://vercel.com) → New Project → اختار الـ repo.
2. Vercel هيكتشف إنه مشروع Next.js تلقائيًا (مفيش إعدادات إضافية مطلوبة).
3. في خطوة الإعداد، ضيف الـ Environment Variables الأربعة اللي فوق.
4. دوس Deploy.

بعد أول Deploy، أول حد يسجّل حساب أو يبعت رسالة، الجداول هتتنشئ تلقائيًا في Neon.

## ملاحظة أمان

مفتاح `TOKENHARBOR_API_KEY` لازم ياخد من [tokenharbor.ai](https://tokenharbor.ai) بعد إنشاء حساب،
وميتحطش أبدًا كمتغير `NEXT_PUBLIC_*` (المتغيرات العادية هنا سيرفر-فقط، آمنة).

## بنية المشروع

```
app/
  layout.tsx, page.tsx, globals.css       ← الصفحة الرئيسية
  api/
    auth/{register,login,logout,me}       ← تسجيل الدخول
    sessions/                             ← إدارة المحادثات
    messages/[sessionId]                  ← جلب رسائل محادثة
    chat/route.ts                         ← إرسال رسالة (streaming)
    chat/continue/route.ts                ← متابعة رد مقطوع
    quota/route.ts                        ← رصيد التوكنز
lib/
  db.ts            ← الاتصال بـ Neon + إنشاء الجداول
  auth.ts           ← جلسات JWT
  systemPrompt.ts   ← شخصية mlag وتعليماته (نفس التطبيق الأصلي)
  ai.ts             ← الاتصال بموديل Token Harbor (DeepSeek V4.1 Flash) + رسائل الأخطاء
  quota.ts          ← منطق رصيد التوكنز والتجديد بعد شهر كامل
  parseContent.ts   ← استخراج ملفات المشروع من رد الموديل
components/         ← واجهة المستخدم (React)
```

## نظام التصميم (Design System)

كل الألوان والمسافات متعرفة من مكان واحد: `app/globals.css` فيه CSS variables
(سطح، خطوط شعرية، حبر، لون تأكيد، ظلال، حركة)، و`tailwind.config.ts` بيقرأهم
كـ semantic tokens فأي مكان في الكود بيكتب `bg-surface` أو `text-ink-2` أو
`border-hair` من غير ما يعرف قيمة اللون.

- **السمة**: `data-theme="light" | "dark"` على `<html>`، بيتحسب قبل أول رسم
  (سكربت tiny في `app/layout.tsx`) عشان مفيش وميض، وبيتحفظ في `mlag-settings`.
- **الطبقات**: `z-nav` (٢٠) لل stickies، `z-overlay` (٤٠) للـ scrims، `z-sheet` (٤٥)
  لقايمة الموبايل، `z-modal` (٥٠) للحوارات، `z-toast` (٦٠).
- **الحركة**: spring عبر `--ease-soft` و`--ease-spring`، transform/opacity بس،
  وكل الأنيميشن بيقف لو المستخدم فعّل خيار «الأنيميشن والحركة» أو نظامه طلب
  `prefers-reduced-motion`.
- **المكوّنات المشتركة**: `components/ui/Controls.tsx` (Button, IconButton,
  Segmented, Switch, Field, Panel, Dialog) — كل شاشة بتستخدم نفس اللغة دي.
- **الاتجاه**: كل المسافات بـ logical properties (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`)
  والنصوص `dir="auto"` عشان الرسائل المختلطة (عربي/إنجليزي) تتقرا صح.

## المميزات المنقولة من التطبيق الأصلي

- شخصية mlag والتعليمات الكاملة (اللهجة المصرية، متى يذكر المطوّر، صيغة الملفات...)
- بحث حي على الإنترنت (web_search tool)
- نظام رصيد توكنز: 500,000 توكن للمسجلين، تجديد تلقائي بعد شهر كامل (30 يوم) من النفاد
- إعادة محاولة تلقائية عند ضغط السيرفر (429) وتبديل الموديل عند الفشل
- استخراج ملفات/مشاريع من الرد (```lang path="..."```) وعرضها كـ "كارت ملف" قابل للتحميل
  (ملف واحد أو zip للمشروع كامل)
- زرار "متابعة" لما الرد يتقطع بسبب طول الرد
- زرار إيقاف أثناء البث
- بيئة تشغيل كود حي (HTML/CSS/JS) داخل iframe معزول
- تخزين حقيقي لكل حاجة (المحادثات، الرسائل، الرصيد) على Neon بدل التخزين المحلي القديم

## Activity Block + تنفيذ أوامر حقيقي (run_command)

كل رد بيعرض فوقه بلوك نشاط قابل للطي (`components/ActivityBlock.tsx`) بيبين
الخطوات الحقيقية اللي حصلت فعلاً في الرد ده — بحث، كتابة ملفات، وتنفيذ أوامر —
كل واحدة بحالتها (`✓ Completed` / `→ Running` / `⚠ Error`)، وبيتقفل لوحده
لما الرد يخلص. مفيش أي خطوة متخيّلة: كل حدث بيتبني من حاجة حصلت فعليًا.

لو ضبطت `E2B_API_KEY` (env var فوق)، الموديل بياخد أداة `run_command` حقيقية
(function calling) يقدر يستخدمها لما يحتاج يتأكد إن الكود اللي كتبه شغال —
زي `npm install`, `npm run build`, `npm test`. لما يستدعيها:

1. السيرفر بيجمع أحدث نسخة من كل ملفات المشروع اللي اتكتبت في نفس المحادثة
   (`lib/agentTools.ts`).
2. بيفتح sandbox حقيقي معزول على [E2B](https://e2b.dev) (`lib/sandbox.ts`)،
   يكتب فيه الملفات، ويشغّل الأمر فعليًا.
3. الـ stdout/stderr/exit code الحقيقيين بيترجعوا للموديل (دورة كاملة، لغاية
   3 جولات كحد أقصى في نفس الرد)، وبيتسجلوا كخطوة `run_command`/`run_tests`
   حقيقية في الـ Activity Block.

من غير `E2B_API_KEY`، الأداة دي مش موجودة أصلاً بالنسبة للموديل — الموقع
بيشتغل زي ما هو من غير أي تغيير. التفعيل اختياري بالكامل.
