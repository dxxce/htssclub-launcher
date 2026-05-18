import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'production' ? "export" : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
