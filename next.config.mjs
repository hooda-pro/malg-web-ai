/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // لازم "same-origin-allow-popups" مش "same-origin" (أو من غير هيدر خالص)،
  // عشان Firebase signInWithPopup يقدر يتابع حالة نافذة تسجيل الدخول بجوجل.
  // من غير الهيدر ده، المتصفح ممكن يمنع الاتصال بين الصفحة والـ popup ويطلع
  // خطأ auth/popup-closed-by-user حتى لو المستخدم فعلاً سجل دخول عادي.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
