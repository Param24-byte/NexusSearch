/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/v1/* to the FastAPI backend in development
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [
          {
            source: "/api/v1/:path*",
            destination: "http://localhost:8000/api/v1/:path*",
          },
        ]
      : [];
  },
  // Required for react-force-graph-2d (uses canvas)
  transpilePackages: ["react-force-graph-2d", "force-graph", "three"],
};

module.exports = nextConfig;
