import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Allow production builds to successfully complete even if
    // there are ESLint errors. Linting still runs in dev and tests.
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    const base = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8011';
    return [
      {
        source: '/reports/:path*',
        destination: `${base}/reports/:path*`,
      },
      {
        source: '/adk/:path*',
        destination: `${base}/adk/:path*`,
      },
    ];
  },
};

export default nextConfig;
