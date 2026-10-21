# CHANGELOG — التحقق في توافق مفتاح الـAPI مع Codex CLI و Claude Code (+ إصلاح الأمثلة والتدقيق العميق)

## ملخص البحث (مصادر رسمية)

| الأداة | البروتوكول اللي بيتكلمه | يشتغل مباشرة على `/api/malg/v1`؟ |
| --- | --- | --- |
| Cline / OpenCode | OpenAI Chat Completions | ✅ مباشرة (tools + streaming + tool_calls مدعومين) |
| Codex CLI (0.95.0+، فبراير 2026) | OpenAI **Responses API** فقط | ❌ مباشرة — محتاج جسر |
| Claude Code | Anthropic Messages API (`/v1/messages`) | ❌ مباشرة — محتاج جسر |

## الإصلاحات المطبقة

### 1) `components/ApiKeysPage.tsx` — إعادة كتابة أمثلة codex و claude
- **codex**: الكونفيج بيبقى على جسر LiteLLM نفسه (`base_url =
  "http://localhost:4000/v1"` + `env_key = "LITELLM_MASTER_KEY"` + `wire_api =
  "responses"`) مع `web_search = "disabled"` و`[features]
  multi_agent = false`. النموذج القديم اللي بعت `wire_api = "chat"` مباشرة
  على الموقع كان هيضرب خطأ مع أي كودكس حديث.
- **claude**: وصفة كاملة: `config.yaml` بتاع LiteLLM (alias اسمه
  `claude-malg` → `openai/malg-ai` على رابطنا) + أمر التشغيل
  `pip install "litellm[proxy]" && litellm --config config.yaml` +
  تصدير `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` /
  `ANTHROPIC_MODEL=claude-malg` /
  `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`.

### 2) `lib/i18n.ts` — تحديث وإضافة (الأربع لغات)
- `akNoteCodex` + `akNoteClaude` بالصيغ الصحيحة (كودكس Responses API بس /
  Claude Code محتاج جسر + شرط الاسم فيه كلمة claude للفلتر).
- مفتاح جديد `akBaseUrlHint`: أدوات بروتوكول OpenAI بتاخد الرابط زي ما هو
  بالـ`/v1`، وأدوات عيلة Anthropic بتضيفه بنفسها.
- حذف مفاتيح ميتة: `akClaudeCode1` + `akClaudeCode2` + `akClaudeRedirect`.

### 3) `app/api/malg/v1/chat/completions/route.ts` — تسامح أكثر مع العملاء
- دور `developer` (اللي بتبعته الـSDKات حديثة من OpenAI) بيتعامل كـ`system`.
- `content` كصف أجزاء (`[{type:"text", text:"..."}]`) بيضم في نص واحد.
- الباقي زي ما هو: Bearer auth، SSE بصيغة OpenAI، function calling كامل
  (`finish_reason: "tool_calls"`)، `[DONE]`، إعادة المحاولة عند الرد الفاضي.

---

## التحديث بعد تجربة فعلية — خطأ 404 على `…/v1/v1/models` (قصة الاكتشاف)

### السبب الجذري (بتأكيد رسمي من دليل Claude Code)
دليل التوافق الرسمي
(`code.claude.com/docs/en/llm-gateway-protocol#model-discovery`) بيشرح
خطوتين:
1. الـ"Model discovery" هو طلب `GET /v1/models?limit=1000` فوق الـbase URL
   (بمهلة 3 ثواني، وأي redirect بيتحسب فشل) — الرابط بتاعنا بينتهي أصلاً
   بـ`/v1` فالطلب بقى `…/api/malg/v1/v1/models` → 404.
2. **حتى لو الرد رجع 200، فيه فلتر تاني**: Claude Code بيفلتر قائمة
   الـ`data[]` وما بياخدش غير الموديل اللي الـid فيه كلمة `claude`
   أو `anthropic` (مطابقة بتتجاهل الحالة) — يعني `malg-ai` كانت
   هتتلغي خالص من القائمة.

### الإصلاح المطبق
1. **`next.config.mjs`**: rewrite داخلي `/api/malg/v1/v1/:path*` →
   `/api/malg/v1/:path*` — أي مسار بمضاعفة `/v1` بيتصحح تلقائيًا (rewrite
   داخلي، مفيش HTTP redirect).
2. **`app/api/malg/v1/models/route.ts`**: الرد بيحقق شكلين — حقول OpenAI
   (`object:"list"`, `object:"model"`) زي ما هي + حقول Anthropic
   (`type:"model"` لكل عنصر، و`first_id` / `last_id` / `has_more` فوق)
   عشان أي عميل بيتكلم شكل Anthropic يقراها صح.
3. **اسم الـalias في LiteLLM بقى `claude-malg`**: اسم فيه كلمة claude
   عشان يعدي فلتر Claude Code ويظهر الموديل في الـpicker — وبنفس الاسم
   في تاب كودكس لأن الاتنين على نفس الجسر.
4. **الصفحة**: تلميح `akBaseUrlHint` (٤ لغات) + ملاحظة `akNoteClaude`
   موضحين الحاجتين.

## التحقق العميق — تأييدات من مراجع رسمية اتقريت حرفيًا
- `developers.openai.com/codex/config-reference.md`:
  `model_providers.<id>.wire_api` — "`responses` is the only supported
  value, and it is the default when omitted" (يعني القيمة `chat`
  اتشالت فعلًا).
  و`web_search`: القيم الرسمية `disabled | cached | indexed | live`
  ("disabled to remove the tool"). و`env_key`: "Environment variable
  supplying the provider API key". وكمان `features.multi_agent`
  متثبتة في الجدول (stable; on by default).
- `docs.litellm.ai/docs/providers/openai_compatible`: توثيق صريح:
  "لو ظهر Not Found Error عند الاختبار، تأكد إن `api_base` فيه
  الـpostfix `/v1`" — يعني `api_base: …/api/malg/v1` في وصفنا صحيح،
  وعميل openai بيضيف استدعاء `/chat/completions` بنفسه من غير أي
  postfix إضافي.
- `code.claude.com/docs/en/llm-gateway-connect`: بيشرح رسميًا إن
  `ANTHROPIC_AUTH_TOKEN` = Authorization: Bearer، و
  `ANTHROPIC_BASE_URL` في الأمثلة الرسمية من غير `/v1`، واختبار
  `POST $ANTHROPIC_BASE_URL/v1/messages`.
- اكتشاف Claude Code بيتوقع شكل Anthropic: بيقرا `id` و
  `display_name` و`description` من `data[]` — ورد `/models` بتاعنا بعد
  التعديل بيناسب الشكل ده (والحقول الزيادة متتجاهل من أي عميل OpenAI).

## الاختبار المحلي الفعلي (سيرفر الإنتاج محليًا على بورت 3311)
- `GET /api/malg/v1/models?limit=1000` → 200 بصيغة `object:"list"` ✅
- `GET /api/malg/v1/v1/models?limit=1000` (المسار المضاعف) → **200 بدل
  الـ404** — الـrewrite شغال حقيقي ✅
- `POST /api/malg/v1/v1/chat/completions` (المسار المضاعف) → الطلب عدى
  من الـrewrite ووصل لجوه الـroute فعليًا (طلع 500 محليًا لأن مفيش
  `DATABASE_URL` على جهازنا — وفي الإنتاج هيرجع 401/402/429/200
  زي التصميم) ✅
- على الإنتاج الحالي (كود قديم قبل الرفع): `/api/malg/v1/models` → 200
  بـ**7 موديلات**، و`/v1/v1/models` → 404 (هيتصلح بعد الـdeploy الجديد).

## تحديث تاني — رسالة "Gateway returned no usable models"
- المعنى: السحب بقى 200 — الـrewrite شغال ✅ — لكن الفلتر التاني شال كل
  القائمة، لأن موديلاتنا `malg-*` ولا واحدة منهم فيها كلمة `claude` أو
  `anthropic` (وده الفلتر الموثق في دليل Claude Code الرسمي).
- الحل المطبق: رد `/models` بقى فيه عنصر ثابت في الآخر اسمه `claude-malg`
  بـdisplay_name "MALG (Claude-compatible)".
- مش موديل مزيف: أي طلب بيه بيمشي عادي — نقطة `/chat/completions` بتحسم
  الموديل الفعلي من المفتاح نفسه (الموديل بيتثبت على المفتاح وقت الإنشاء).

## التحديث الثالث — نقطة Anthropic الأصيلة `/v1/messages` (الردود مباشرة)
- بعد ما الاكتشاف نجح ("found 1 model")، بقي الردود: البرنامج بيبعت
  `POST …/v1/messages` (وبعد الـrewrite الداخلي يوصل للنقطة دي) — لكنها
  كانت مش موجودة، فكان بيرجع 404 HTML.
- بنيت `app/api/malg/v1/messages/route.ts`: بتترجم الطلب من صيغة
  Anthropic لصيغة OpenAI (system نص أو blocks، `tool_use` ↔ `tool_calls`،
  `tool_result` ↔ رسايل `tool`، `tools`/`input_schema` ↔
  `tools`/`parameters`، و`tool_choice` بكل صيغه)، وبنادي نقطة
  `/chat/completions` الداخلية على نفس السيرفر (فالمصادقة والرصيد
  والـrate limit والأدوات والـstreaming — نفس المنطق المجرّب)، وبترجّع
  الرد أو الـSSE بصيغة Anthropic: `message_start` /
  `content_block_start` / `content_block_delta` / `input_json_delta` /
  `message_delta` / `message_stop`.
- المصادقة: `Authorization: Bearer` أو `x-api-key`.
- الصفحة: تاب Claude Code بقى وصلة مباشرة من غير جسر — والجسر باقي
  كخطة بديلة.

## المصادر
- كودكس — مرجع الكونفيج الرسمي: https://developers.openai.com/codex/config-reference/
- إعلان استغناء عن Chat Completions: https://github.com/openai/codex/discussions/7782
- مشكلة تقارب خطأ «chat wire API deprecated» بعد التحديث: https://github.com/janhq/jan/issues/7413
- نقل إزالتها (فبراير 2026 / 0.95.0) + `multi_agent = false`: https://opper.ai/blog/codex-router/
- كلود كود + LiteLLM (الوصفة الرسمية): https://docs.litellm.ai/docs/tutorials/claude_non_anthropic_models
- LiteLLM OpenAI-Compatible: https://docs.litellm.ai/docs/providers/openai_compatible
- Claude Code — دليل توافق الجيت واي (Model discovery): https://code.claude.com/docs/en/llm-gateway-protocol
- Claude Code — الربط بالجيت واي: https://code.claude.com/docs/en/llm-gateway-connect

## الجاي (اقتراح)
- نقطة نهاية أصيلة `/api/malg/v1/messages` (Anthropic Messages فرعي)
  أو `/api/malg/v1/responses` (OpenAI Responses API فرعي متوافق مع
  كودكس: أحداث `response.created` / `output_item.added|done` /
  `output_text.delta` / `response.completed` + تحويل `function_call` ↔
  `function_call_output`) — وقتها كودكس وكلود كود يلقو شغالين مباشرة من
  غير أي جسر. محتاج تحقق فعلي بتنزيل الأداة على جهازنا ومفتاح اختبار
  مؤقت — دي حاجة تستحق تيرن لوحدها.
