/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/v1/* to the FastAPI backend in development
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/:path*`,
      },
    ];
  },
  // Required for react-force-graph-2d (uses canvas)
  transpilePackages: ["react-force-graph-2d", "force-graph", "three"],
};

module.exports = nextConfig;
