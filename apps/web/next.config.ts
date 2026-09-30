import type { NextConfig } from "next"

const apiOrigin = (process.env.API_ORIGIN ?? "http://localhost:8000").replace(/\/$/, "")

if (process.env.VERCEL && !process.env.API_ORIGIN) {
  throw new Error("Set API_ORIGIN to your deployed Faldo API URL (for example https://faldo-api.vercel.app).")
}

/**
 * Content-Security-Policy, report-only for now: browsers report what it would block to the API
 * (/api/v1/security/csp-report) without blocking anything. Scripts still allow inline code because Next's own
 * bootstrap and the theme and motion scripts in layout.tsx are inline; enforcing it means moving those to per-request
 * nonces (which makes every page render on demand) and confirming no reports for sign-in, theme, the scanner, phone
 * notifications and dictation. Development adds 'unsafe-eval' for fast refresh.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://appleid.apple.com",
  "report-uri /api/v1/security/csp-report",
  "report-to csp",
].join("; ")

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
          { key: "Content-Security-Policy-Report-Only", value: CSP },
          { key: "Reporting-Endpoints", value: 'csp="/api/v1/security/csp-report"' },
        ],
      },
    ]
  },
}

export default nextConfig
