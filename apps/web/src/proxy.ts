import { NextResponse, type NextRequest } from "next/server"

const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"]

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = request.cookies.has("faldo_session")
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!api|version|_next/static|_next/image|brand/|sounds/|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest).*)"],
}
