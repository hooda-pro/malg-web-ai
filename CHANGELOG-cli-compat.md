# CHANGELOG — التحقق في توافق مفتاح الـAPI مع Codex CLI و Claude Code (+ إصلاح الأمثلة زي ما اتحققت من المراجع الرسمية)

## اللي طلع من البحث (بتواريخ ومصادر رسمية)

| الأداة | البروتوكول اللي بيتكلمه | يشتغل مباشرة على `/api/malg/v1`؟ |
| --- | --- | --- |
| Cline / OpenCode | OpenAI Chat Completions | ✅ مباشرة (tools + streaming + tool_calls مدعومين) |
| Codex CLI (0.95.0+، فبراير 2026) | OpenAI **Responses API** فقط | ❌ مباشرة — محتاج جسر |
| Claude Code | Anthropic Messages API (`/v1/messages`) | ❌ مباشرة — محتاج جسر |

### أكتشافات Codex (الأهم)
- `wire_api = "chat"` (Chat Completions) **اتشال نهائيًا من Codex في فبراير
  2026 (إصدار 0.95.0)** — اتأكد أعلان الاستغناء عنها في ديسمبر 2025، والقيمة
  دلوقتي بترمي خطأ صريح بيهدي على الموضوع.
- المرجع الرسمي للكونفيج (`developers.openai.com/codex/config-reference`)
  حرفيًا: `model_providers.<id>.wire_api` → القيمة المدعومة الوحيدة هي
  `responses` وهي كمان الافتراضية. يعني كودكس بيبعت `POST {base_url}/responses`
  — وموقعنا ما عندهوش المسار ده أصلاً (عندنا بس `/chat/completions`)
  فلو صوّبناه على الموقع مباشرة هيضرب 404.
- تفصيلة خاصة بالـbackends من برة: `features.multi_agent = false` انتهية
  (أدوات زي `tool_search` بتكسر الجلسة فتطلع "stream disconnected")، وكمان
  `web_search = "disabled"` لبعض المزودين.

### أكتشافات Claude Code
- كلود كود بيتكلم بروتوكول Anthropic بس — مفيش أي إعداد "OpenAI-compatible"
  في نفسه؛ الرابط الرسمي للربط بموديلات غير-Anthropic هو **LiteLLM Proxy**
  اللي عنده `/v1/messages` أصلي، مع ثلاث متغيرات:
  `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` (مفتاح LiteLLM) / `ANTHROPIC_MODEL`.

## الإصلاحات المطبقة

### 1) `components/ApiKeysPage.tsx` — إعادة كتابة أمثلة codex و claude
- **codex**: الكونفيج بيبقى على جسر LiteLLM نفسه (`base_url =
  "http://localhost:4000/v1"` + `env_key = "LITELLM_MASTER_KEY"` + `wire_api =
  "responses"`) مع `web_search = "disabled"` و`[features]
  multi_agent = false`. النموذج القديم اللي بعت `wire_api = "chat"` مباشرة
  على الموقع كان هيضرب خطأ مع أي كودكس حديث.
- **claude**: وصفة كاملة واحدة: `config.yaml` بتاع LiteLLM (موديل
  `openai/malg-ai` + `api_base` = رابطنا + مفتاحنا من env) + أمر التشغيل
  `pip install "litellm[proxy]" && litellm --config config.yaml` + تصدير
  المتغيرات الثلاثة تباع كلود كود.
- استخدام المفاتيح `akClaudeCode1/2/akClaudeRedirect` اتشال من الصفحة.

### 2) `lib/i18n.ts` — تحديث ونضافة (الأربع لغات)
- `akNoteCodex`: الصيغة الجديدة بتقول الحقيقة: كودكس الحديث Responses API بس،
  `wire_api = "chat"` اتشال، والربط عن طريق جسر LiteLLM، و`multi_agent =
  false` مهمة، وبدون جسر: Cline أو OpenCode.
- `akNoteClaude`: من غير جسر مش هيشتغل — بروتوكول Anthropic بس، LiteLLM
  بيترجم تلقائيًا، والأسهل Cline أو OpenCode.
- حذف مفاتيح ميتة: `akClaudeCode1` + `akClaudeCode2` + `akClaudeRedirect`
  (ar/en/fr/es) لأن المثالات الجديدة مش محتجاها.

### 3) `app/api/malg/v1/chat/completions/route.ts` — تسامح أكثر مع العملاء
- دور `developer` (اللي بتبعته الـSDKات الحديثة بتاع OpenAI) بيتعامل كـ
  `system` بدل ما يترفض بـ«شكل الرسائل غير صحيح».
- `content` كصف أجزاء (`[{type:"text", text:"..."}]`) بيضم في نص واحد
  بـ`\n` بدل الرفض — الـSDKات متعددة الوسائط بتبعته كده أحيانًا.
- كل حاجة تانية زي ما هي (Bearer auth، SSE بتنسيق OpenAI، function calling
  كامل بـ`finish_reason: "tool_calls"`، `[DONE]`، إعادة المحاولة عند الرد الفاضي).

## المصادر المتحقق منها
- كودكس — مرجع الكونفيج الرسمي: https://developers.openai.com/codex/config-reference/ (`wire_api`: `responses` القيمة الوحيدة)
- إعلان استغناء عن Chat Completions: https://github.com/openai/codex/discussions/7782
- مشكلة تقارب خطأ «chat wire API deprecated» بعد التحديث: https://github.com/janhq/jan/issues/7413
- نقل إزالتها (فبراير 2026 / 0.95.0) + `multi_agent = false`: https://opper.ai/blog/codex-router/
- كلود كود + LiteLLM (الوصفة الرسمية): https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models

## الجاي (اقتراح)
- نقطة نهاية أصيلة `/api/malg/v1/responses` (OpenAI Responses API فرعي
  متوافق مع كودكس: أحداث `response.created` / `output_item.added|done` /
  `output_text.delta` / `response.completed` + تحويل `function_call` ↔
  `function_call_output`) — وقتها كودكس يبقى شغال مباشرة من غير أي جسر.
  محتاج تحقق فعلًا بتنزيل كودكس CLI على جهازنا ومفتاح اختبار مؤقت — دي
  حاجة تستحق تيرن لوحدها.
