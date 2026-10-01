/**
 * Which pages anyone can open signed out, and where a signed-out visitor to any other page goes. Used by the proxy
 * (src/proxy.ts), which decides before a page loads, and by the API client when a session ends mid-visit.
 *
 * No runtime imports, so it runs under the web tests as it is.
 */
export const PUBLIC_PATHS = ["/welcome", "/login", "/register", "/forgot-password", "/reset-password", "/logout", "/privacy", "/terms"] as const

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Signed out: Home becomes the start page (what Faldo is, the demo and signing up), and any other private page goes to
 * Log in, which comes back to it afterwards. Null means the page is public and opens as it is.
 */
export function signedOutDestination(pathname: string, search = ""): string | null {
  if (isPublicPath(pathname)) return null
  if (pathname === "/") return "/welcome"
  return `/login?next=${encodeURIComponent(pathname + search)}`
}
