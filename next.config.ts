import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer usa ESM — Next.js debe transpilarlo durante el build
  transpilePackages: ['@react-pdf/renderer'],
};

export default nextConfig;
