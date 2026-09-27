import { FlatCompat } from "@eslint/eslintrc";

// FlatCompat بيسمحلنا نستخدم إعدادات ESLint "القديمة" (زي eslint-config-next)
// جوه صيغة الـ flat config الجديدة اللي Next.js 16 محتاجها.
const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  // يجيب قواعد Next.js الأساسية (بما فيها فحص React hooks وإمكانية الوصول a11y)
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    // ملفات ومجلدات مش عايزين ESLint يدخلها أصلاً
    ignores: [
      "node_modules/**",
      ".next/**",
      "next-env.d.ts",
      "public/**",
    ],
  },

  {
    // قواعد إضافية أو تعديل شدة القواعد الموجودة
    rules: {
      // متغير أو import معمول ومش مستخدم = تحذير بس مش خطأ يوقف الـ build
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // استخدام any صريح = تحذير عشان نلاحظه من غير ما نمنعه فجأة في مشروع قديم
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];

export default eslintConfig;
