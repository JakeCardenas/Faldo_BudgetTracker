import { NextResponse, type NextRequest } from "next/server"
import { signedOutDestination } from "@/shared/config/routes"

const FORWARDED_IP = "x-faldo-client-ip"
const PROXY_AUTH = "x-faldo-proxy-auth"

/**
 * API requests go to the API through a rewrite, so the API sees Vercel's address rather than the visitor's. The
 * visitor's address (which Vercel sets on this request and doesn't let callers forge) is passed on with a secret only
 * this app and the API know (PROXY_SHARED_SECRET), and anything a caller sent in those headers is dropped. See
 * apps/api/app/core/client_ip.py.
 */
function toApi(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.delete(FORWARDED_IP)
  headers.delete(PROXY_AUTH)
  const secret = process.env.PROXY_SHARED_SECRET
  const visitor = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
  if (secret && visitor) {
    headers.set(FORWARDED_IP, visitor)
    headers.set(PROXY_AUTH, secret)
  }
  return NextResponse.next({ request: { headers } })
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (pathname.startsWith("/api/")) return toApi(request)
  const destination = request.cookies.has("faldo_session") ? null : signedOutDestination(pathname, search)
  return destination ? NextResponse.redirect(new URL(destination, request.url)) : NextResponse.next()
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api|version|_next/static|_next/image|brand/|sounds/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest).*)",
  ],
}
