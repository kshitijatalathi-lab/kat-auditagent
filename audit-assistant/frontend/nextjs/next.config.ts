import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // Allow production builds to successfully complete even if
    // there are ESLint errors. Linting still runs in dev and tests.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
