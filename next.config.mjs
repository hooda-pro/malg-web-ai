/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  agentRules: false,
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  /* مفيش أي badge/شريط أدوات أثناء التطوير — نفسي من العميلة `N` الصغيرة. */
  devIndicators: false,
  async rewrites() {
    return [
      {
        // أدوات عيلة Anthropic (زي Claude Code) بتضيف /v1 من نفسها فوق الـbase —
        // وbase بتاعنا أصلاً بينتهي بـ/v1، فبتبقى /v1/v1/… وبترمي 404
        // (زي …/v1/v1/models). بنلغي التكرار داخليًا: نفس المسار ببساطة.
        source: "/api/malg/v1/v1/:path*",
        destination: "/api/malg/v1/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
