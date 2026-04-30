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

export default nextConfig;
