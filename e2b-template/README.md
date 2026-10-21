# رفع رام الـ sandbox (عشان `npm install` مايتقتلش)

الـ sandbox الافتراضي في E2B = **2 vCPU و512 MiB رام** (ده اللي كان بيسبب `Killed` / exit 137 في
`npm install` لمشروع Next + React + firebase). الرام بتتحدد وقت **بناء الـ template** مش وقت التشغيل،
فلازم تبني template بحجم أكبر مرة واحدة:

```bash
npm i -g @e2b/cli
e2b auth login
cd e2b-template
e2b template build --name malg-node --cpu-count 4 --memory-mb 4096
```

بعدها ضيف الـ env vars دي على السيرفر (Vercel / .env.local) وأعد النشر:

```
E2B_TEMPLATE=malg-node
E2B_SANDBOX_MEMORY_MB=4096
```

- `E2B_TEMPLATE`: اسم الـ template اللي بنيته. لو مش موجود بيستخدم الـ base (512MB).
- `E2B_SANDBOX_MEMORY_MB`: نفس الرقم اللي بنيت بيه — بيتقال للموديل في الـ system prompt عشان يعرف حدوده
  (ولو أقل من 2048 بينبّه إن مشاريع Next الكبيرة مش هتتبني).

ملاحظات:
- حسب توثيق E2B، الحد الأقصى في الخطة المجانية (Hobby) حوالي 8 vCPU و8 GB، وأعلى في Pro — راجع حدود حسابك في
  dashboard قبل ما تختار رقم. الرام الأكبر بتزوّد تكلفة الثانية، فـ 4096 نقطة وسط معقولة لـ Next.
- الرام مش ممكن تتغيّر لـ sandbox شغّال — أي تغيير معناه إعادة بناء template.
- لو الـ CLI أو أوامره اتغيّرت في إصدار أحدث، اتبع docs E2B: https://e2b.dev/docs/template/quickstart
