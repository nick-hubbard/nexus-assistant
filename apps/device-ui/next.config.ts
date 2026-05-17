import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@open-nexus/ui", "@open-nexus/protocol"],
};

export default nextConfig;
