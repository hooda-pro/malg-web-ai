# CHANGELOG — نظام المهارات المحلية (Skills)

## الميزة
مهارات (Skills) بأسلوب Agent Skills: المستخدم يستورد ملف `SKILL.md` (بـ
frontmatter فيه `name` و`description`) أو أرشيف `.zip` فيه `SKILL.md` +
سكربتات/قوالب، أو مجلد كامل — والموديل بتاع MALG يقدر يقرا المهارة ويستخدمها
فعلًا لما الأسئلة تخصها.

## الخصوصية/الأمان (بالهندسة نفسها، مش بوعد)
- **صفر تخزين سيرفر:** مفيش endpoint جديد في `app/api` ولا جدول في Neon.
  التخزين كل في المتصفح: IndexedDB بتسمية `mlag-skills` (شوف `lib/skillsClient.ts`).
- **حمولة مؤقتة:** مع كل رسالة، المهارات الفعّالة (حتى 8) بتتبعت كـ `body.skills`
  في طلب الشات نفسه، بتتقري وتتستخدم في الذاكرة وبتتموت مع الريكوست.
- **تنقية موثوقة-بالمحاولة:** `sanitizeIncomingSkills` بتقص وتتنقي كل حقل
  (اسم/وصف/نص/ملفات/مسارات) — مفيش `..` ولا مسارات مطلقة ولا NUL ولا حروف
  اتجاه مخفية، وسقوف صارمة (24K للنص الأساسي، 60K للملف، 40 ملف، 400K إجمالي).
- **أدوات مقفولة بشرط:** لما مفيش مهارات في الطلب، `read_skill` و
  `read_skill_file` مبنتبعتش للموديل أصلًا (نفس منطق `run_command` مع E2B).

## كيف بيقرأها الموديل (progressive disclosure زي Claude)
1. `system prompt` فيه بلوك 11c فيه قايمة مختصرة (اسم — وصف — الملفات الإضافية).
2. `read_skill(name)` → النص الكامل (مقصوص عند 16K حرف لو أطول).
3. `read_skill_file(name, path)` → ملف إضافي داخل المهارة.
4. كل استدعاء بيبان للسيرفر كخطوة `read_skill`/`read_skill_file` في Activity
   Block (أيقونة Puzzle + تسمية عربية).

## مسار «كمّل» (continue)
المسار ده مش فيه أدوات، فالنصوص الكاملة بتتحقن في الـsystem prompt مباشرة
بميزانية 24K نفس `API_INLINE_TOTAL_MAX_CHARS` — محتوى مؤقت مش بيتخزن.

## الواجهة
- تاب «المهارات» جديد في الإعدادات (`components/SkillsPanel.tsx`):
  استيراد (ملفات/مجلد/zip)، عرض المحتوى، تفعيل/إلغاء، تصدير zip، حذف.
- شيب صغير جنب الموديل بيك (`BottomInputBar`) بيرجع عدد المهارات الفعّالة،
  الضغط عليه بيفتح التاب — الشيل بيتحدث لحظيًا عبر حدث `mlag:skills-changed`.
- i18n: مفتاح `settingsSkillsTab` مترجم في ar/en/fr/es (اللي جوه التاب عربي
  زي FactsManager).

## الملفات
- جديد: `lib/skills.ts` (مشترك + تنقية)، `lib/skillsClient.ts` (IndexedDB +
  استيراد/تصدير)، `components/SkillsPanel.tsx`، `skills-examples/arabic-cover-writer.md`
  (مثال تجرّب استيراده من تاب المهارات).
- معدّل: `app/api/chat/route.ts`، `app/api/chat/continue/route.ts`،
  `lib/systemPrompt.ts`، `lib/agentTools.ts`، `lib/agentEvents.ts`،
  `components/ChatShell.tsx`، `components/BottomInputBar.tsx`،
  `components/SettingsModal.tsx`، `components/AccountMenu.tsx`،
  `components/ActivityBlock.tsx`، `lib/i18n.ts`.

## ملاحظات تحقق
- `tsc --noEmit` نظيف.
- مفيش أي متغير بيئة جديد — الميزة شغالة من أول تشغيل بدون إعداد.
