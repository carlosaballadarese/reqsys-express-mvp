import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer falla si se bundlea — se carga como externo en runtime
  serverExternalPackages: ['@react-pdf/renderer'],
};

export default nextConfig;
