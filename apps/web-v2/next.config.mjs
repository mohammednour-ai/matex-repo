import nextBundleAnalyzer from "@next/bundle-analyzer";

// Run `ANALYZE=true pnpm --filter @matex/web-v2 build` to emit interactive
// bundle reports under apps/web-v2/.next/analyze/ (client.html + server.html).
const withBundleAnalyzer = nextBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

// Derive the Supabase host from NEXT_PUBLIC_SUPABASE_URL so the same
// remotePatterns config works across local / preview / prod. If the env
// isn't set at build time we still ship a wildcard for *.supabase.co so
// public storage URLs render without a runtime URL parse on every <Image>.
function supabaseImageHost() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const supabaseHost = supabaseImageHost();

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // P1-15b — allow next/image to optimize listing photos and avatars
    // stored in Supabase Storage. We only allow the storage-object path so
    // a misconfigured tool can't trick us into proxying arbitrary content
    // off the Supabase host.
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: "https",
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
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
