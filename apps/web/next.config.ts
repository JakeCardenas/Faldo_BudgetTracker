import type { NextConfig } from "next"

const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:8000").replace(/\/$/, "")

if (process.env.VERCEL && !process.env.API_ORIGIN) {
  throw new Error("Set API_ORIGIN to your deployed Faldo API URL (for example https://faldo-api.vercel.app).")
}

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  agentRules: false,
  compress: false,
  // 90 keeps Faldo's fur and eyes crisp; everything else uses the default 75.
  images: { qualities: [75, 90] },
  // Lets an open copy of the app notice a newer deploy (see UpdateCheck).
  env: { NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiOrigin}/api/:path*` }]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
}

export default nextConfig
