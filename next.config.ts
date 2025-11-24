import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Increasing the in-memory incremental cache size so large entries
  // (e.g. wallet analysis payloads) don't exceed Next.js defaults
  cacheMaxMemorySize: 256 * 1024 * 1024, // 256 MB
};

export default nextConfig;
