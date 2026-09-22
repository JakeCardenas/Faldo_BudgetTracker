"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { BUILD_ID } from "@/lib/build"

/** How often, at most, to ask which version is live. */
const EVERY = 60_000
/** Set once a newer version is live, so the next page change loads it. */
let stale = false

/**
 * Keeps an open copy of Faldo current. A home screen web app on iOS resumes where you left it instead
 * of reloading, so it can keep running an old version long after a new one ships. Whenever the app
 * comes back to the front it asks which build is live, and if a newer one shipped it reloads, unless
 * you are in the middle of something (a sheet open or a field focused), in which case it loads the
 * new version on your next page change. It tries once per new build, so it can never loop.
 */
export function UpdateCheck() {
  const pathname = usePathname()

  useEffect(() => {
    if (stale) window.location.reload()
  }, [pathname])

  useEffect(() => {
    if (BUILD_ID === "dev") return
    let checked = 0
    const check = async () => {
      if (document.visibilityState !== "visible" || stale || Date.now() - checked < EVERY) return
      checked = Date.now()
      try {
        const res = await fetch("/version", { cache: "no-store" })
        if (!res.ok) return
        const { build } = (await res.json()) as { build?: string }
        if (!build || build === "dev" || build === BUILD_ID) return
        if (sessionStorage.getItem("faldo:updated-to") === build) return
        sessionStorage.setItem("faldo:updated-to", build)
        stale = true
        const busy = document.querySelector('[role="dialog"]') || document.activeElement?.matches("input, textarea, select, [contenteditable]")
        if (!busy) window.location.reload()
      } catch {
        // Offline, or storage is blocked: try again next time.
      }
    }
    void check()
    document.addEventListener("visibilitychange", check)
    window.addEventListener("pageshow", check)
    return () => {
      document.removeEventListener("visibilitychange", check)
      window.removeEventListener("pageshow", check)
    }
  }, [])

  return null
}
