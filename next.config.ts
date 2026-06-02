import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.NODE_ENV === 'production' ? "export" : undefined,
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Persist Turbopack's compile cache to .next between dev sessions so the
    // app's first `GET /` after restarting `tauri dev` is fast instead of a
    // full cold recompile every time.
    turbopackFileSystemCacheForDev: true,
  },
};

export default nextConfig;
