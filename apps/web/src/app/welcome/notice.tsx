"use client"

import { useSearchParams } from "next/navigation"

/** After a demo reaches its end, the app comes back here (shared/api/client.ts) and this says what happened. */
export function DemoEndedNotice() {
  if (useSearchParams().get("demo") !== "ended") return null
  return (
    <p role="status" className="mx-auto mt-4 max-w-[40rem] rounded-2xl bg-secondary px-4 py-3 text-center text-sm text-secondary-foreground">
      Your demo has ended. Start a new one, or create an account to keep your own records.
    </p>
  )
}
