import nextBundleAnalyzer from "@next/bundle-analyzer";

// Run `ANALYZE=true pnpm --filter @matex/web-v2 build` to emit interactive
// bundle reports under apps/web-v2/.next/analyze/ (client.html + server.html).
const withBundleAnalyzer = nextBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/auction", destination: "/auctions", permanent: true },
      { source: "/auction/:path*", destination: "/auctions/:path*", permanent: true },
      { source: "/inspection", destination: "/inspections", permanent: true },
      { source: "/inspection/:path*", destination: "/inspections/:path*", permanent: true },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
