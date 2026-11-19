/** @type {import('next').NextConfig} */

// Bundle analyzer — run with ANALYZE=true npm run build to generate bundle reports.
// Closes #1070: bundle code splitting audit.
// Closes #1477: dynamic imports and code splitting to reduce initial bundle size.
//
// Workflow:
//   1. ANALYZE=true npm run build
//   2. Open the generated .next/analyze/*.html reports in a browser
//   3. Verify the initial bundle excludes heavy libs (recharts, @stellar/freighter-api)
//      which are now loaded on demand via next/dynamic.
let withBundleAnalyzer = (config) => config;
try {
  withBundleAnalyzer = require("@next/bundle-analyzer")({
    enabled: process.env.ANALYZE === "true",
  });
} catch {
  // @next/bundle-analyzer is an optional dev dependency
}

const nextConfig = {
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
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
  experimental: {
    // Ensure heavy optional libraries are treated as separate chunks so that
    // dynamic imports resolve to their own bundles instead of being inlined
    // into the initial page bundle.
    optimizePackageImports: ["recharts", "@stellar/freighter-api"],
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Split heavy vendor libraries into dedicated chunks. These are only
      // fetched when the corresponding dynamically imported component loads,
      // keeping the initial bundle small (see #1477).
      const existingSplitChunks = config.optimization.splitChunks || {};
      const existingCacheGroups = existingSplitChunks.cacheGroups || {};

      config.optimization.splitChunks = {
        ...existingSplitChunks,
        chunks: existingSplitChunks.chunks || "all",
        cacheGroups: {
          ...existingCacheGroups,
          // Charting library — loaded lazily by chart components.
          recharts: {
            test: /[\\/]node_modules[\\/]recharts[\\/]/,
            name: "vendor-recharts",
            chunks: "async",
            priority: 30,
            reuseExistingChunk: true,
            enforce: true,
          },
          // Wallet SDK — loaded lazily only when the user initiates a connection.
          freighter: {
            test: /[\\/]node_modules[\\/]@stellar[\\/]freighter-api[\\/]/,
            name: "vendor-freighter",
            chunks: "async",
            priority: 30,
            reuseExistingChunk: true,
            enforce: true,
          },
          // Generic vendor chunk for the rest of node_modules.
          defaultVendors: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendors",
            chunks: "all",
            priority: 10,
            reuseExistingChunk: true,
          },
        },
      };
    }

    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);