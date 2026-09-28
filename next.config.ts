import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server for the Docker image (see Dockerfile).
  output: "standalone",
  // Server-only packages loaded with require() at runtime.
  serverExternalPackages: ["archiver", "postgres"],
};

export default nextConfig;
