import { BUILD_ID } from "@/lib/build"

export const dynamic = "force-dynamic"

/** The build that is live right now, so an open copy of the app can tell when a newer one ships. */
export function GET() {
  return Response.json({ build: BUILD_ID }, { headers: { "Cache-Control": "no-store" } })
}
