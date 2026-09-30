import { NextResponse, type NextRequest } from "next/server"

/**
 * Removes the session cookie from this browser even when the API can't be reached to end the session, so signing out
 * always leaves the browser signed out. It needs the app's own header, so another site can't sign people out.
 */
export function POST(request: NextRequest) {
  if (request.headers.get("x-faldo-client") !== "web") return new NextResponse(null, { status: 403 })
  const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })
  response.cookies.set("faldo_session", "", {
    path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
  })
  return response
}
