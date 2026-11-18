import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.100.20"],
  async redirects() {
    // The landing page moved from /welcome to the site root.
    return [{ source: "/welcome", destination: "/", permanent: true }];
  },
  transpilePackages: ["@phosphor-icons/react"],
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "lucide-react"],
  },
};

export default nextConfig;
