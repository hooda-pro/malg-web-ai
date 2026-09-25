/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // firebase-admin حزمة سيرفر تقيلة (gRPC/undici) — الأفضل تفضل external
    // بدل ما Next يحاول يعمل bundle ليها جوه webpack.
    serverComponentsExternalPackages: ["firebase-admin"],
  },
};

export default nextConfig;
