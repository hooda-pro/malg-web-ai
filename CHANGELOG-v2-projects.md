# سجل التغييرات — المشاريع والحقائق (v2-projects)

## قاعدة البيانات (lib/db.ts — داخل ensureSchema)

- جدول `projects`: `(id, user_id, name, instructions, created_at, updated_at)` + فهرس `idx_projects_user`.
- جدول `project_files`: `(id, project_id, path, lang, content, updated_at)` + قيد `UNIQUE(project_id, path)` + فهرس `idx_project_files_project`.
- جدول `user_facts`: `(id, user_id, fact, category, created_at)` + فهرس `idx_user_facts_user`.
- عمود `chat_sessions.project_id` (TEXT, يقبل NULL) — ربط المحادثة بالمشروع.
- توليد المعرّفات بـ `randomUUID()` من `crypto` (نفس أسلوب الجلسات/الرسائل).

## واجهات API

| الطريقة | المسار | الجسم | الوصف |
|---|---|---|---|
| GET | /api/projects | — | قائمة مشاريع المستخدم مع عدد الجلسات |
| POST | /api/projects | {name≤60} | إنشاء مشروع |
| GET | /api/projects/[id] | — | ملفات المشروع (بعد فحص الملكية) |
| PATCH | /api/projects/[id] | {name?≤60, instructions?≤2000} | تعديل الاسم/التعليمات |
| DELETE | /api/projects/[id] | — | حذف المشروع + ملفاته + فك ربط الجلسات |
| GET | /api/projects/[id]/files | — | قائمة الملفات |
| PUT | /api/projects/[id]/files | {files:[{path≤120, lang≤20, content≤12000}] حتى 20} | استبدال كل الملفات |
| POST | /api/projects/[id]/attach | {sessionId: string\|null} | نص = ربط الجلسة بالمشروع، null = فك ربط كل جلسات المشروع |
| GET | /api/facts | — | آخر 50 حقيقة |
| POST | /api/facts | {fact≤300, category≤30} | إضافة حقيقة (سقف 100/مستخدم) |
| DELETE | /api/facts/[id] | — | حذف حقيقة |

كل المسارات: `dynamic = "force-dynamic"` + `getSessionUser()` + `401` بدون جلسة + `400` على مدخلات سيئة + `404` على الغريب/المفقود.

## المكونات

- `components/ProjectsPanel.tsx` — props: `{sessionId: string|null}`. اختيار المشروع، إنشاء/إعادة تسمية/حذف، textarea للتعليمات + حفظ، قائمة ملفات (إضافة/تعديل/حذف عبر Dialog)، ربط/فك ربط المحادثة الحالية. عربي، `dir` موروثة (rtl).
- `components/FactsManager.tsx` — بدون props. عرض/إضافة/حذف الحقائق مع تصنيف (عام/عمل/برمجة/تفضيلات) وحدود طول مطبقة في العميل أيضًا.
- التصميم: كلاسات التوكن (`bg-surface border-hair rounded-xl text-ink`) + مكونات `Button/Field/Dialog/Panel` من `components/ui/Controls.tsx`.

## الميزانيات (lib/projects.ts + lib/facts.ts)

- الملف الواحد: حد أقصى 12,000 حرف (`PROJECT_FILE_MAX_CHARS` — يُقصّ عند الحفظ).
- إجمالي سياق المشروع: 24,000 حرف (`PROJECT_TOTAL_MAX_CHARS`).
- الفهرس المُرسل للموديل سطور `"path (lang, N chars)"` + تنبيه أن يطلب من المستخدم لصق الملف الكامل عند الحاجة.
- الحقائق: 300 حرف/حقيقة (`FACT_MAX_CHARS`)، سقف 100 حقيقة/مستخدم (الأقدم يُحذف تلقائيًا)، تُحقن الأحدث أولًا (`getTopFacts` بحد افتراضي 10).
