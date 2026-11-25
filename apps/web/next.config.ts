import path from "node:path";
import type { NextConfig } from "next";

// The Content-Security-Policy is set per request with a nonce in proxy.ts.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compress: true,
  // Container builds set NEXT_OUTPUT=standalone (self-contained server.js).
  // Not the default: standalone output needs symlinks, which local Windows
  // builds may not be allowed to create.
  ...(process.env.NEXT_OUTPUT === "standalone" && {
    output: "standalone" as const,
    // Monorepo root (the build runs in apps/web): traces packages/ and the
    // pnpm store so server.js finds every dependency.
    outputFileTracingRoot: path.join(process.cwd(), "../.."),
  }),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.pixabay.com",
        pathname: "/photo/**",
      },
    ],
  },
};

export default nextConfig;
