/** @type {import('next').NextConfig} */

// Bundle analyzer — run with ANALYZE=true npm run build to generate bundle reports.
// Closes #1070: bundle code splitting audit.
// Issue #1472: used to identify unused CSS/JS and trim client bundles.
let withBundleAnalyzer = (config) => config;
try {
  withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
  });
} catch {
  // @next/bundle-analyzer is an optional dev dependency
}

const isProd = process.env.NODE_ENV === "production";

const nextConfig = {
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // SWC minification is the default in modern Next.js, but keep it explicit
  // so the intent (smaller client bundles => lower TBT) is documented.
  swcMinify: true,
  experimental: {
    // Tree-shake barrel imports from these packages so only the icons/components
    // actually used are shipped to the client. Reduces unused JS (issue #1472).
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
  modularizeImports: {
    // Rewrite `import { Foo } from "lucide-react"` into per-icon imports,
    // avoiding pulling the entire icon set into the bundle.
    "lucide-react": {
      transform: "lucide-react/dist/esm/icons/{{kebabCase member}}",
    },
  },
  images: {
    // Serve modern formats first for better LCP on the CI-measured build.
    formats: ["image/avif", "image/webp"],
    // Cache optimized images aggressively to cut repeat optimization cost.
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    // Allow collateral photo URLs from any HTTPS source.
    // Add specific domains here to tighten the allow-list in production.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  compiler: {
    // Strip console.* calls from production bundles to reduce shipped JS.
    removeConsole: isProd ? { exclude: ["error", "warn"] } : false,
  },
};

module.exports = withBundleAnalyzer(nextConfig);