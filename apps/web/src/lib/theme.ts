"use client"

import { useCallback } from "react"
import { flushSync } from "react-dom"
import { useTheme } from "next-themes"

let crossfading = false

/**
 * The theme setter, with a short crossfade between light and dark where the browser supports view
 * transitions. Falls back to an instant switch, and always switches instantly with reduced motion or
 * while another crossfade is still running (the saved setting syncing back, for example).
 */
export function useSmoothTheme() {
  const { theme, setTheme } = useTheme()
  const set = useCallback((next: string) => {
    if (next === theme) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced || crossfading || !("startViewTransition" in document)) {
      setTheme(next)
      return
    }
    crossfading = true
    const transition = document.startViewTransition(() => flushSync(() => setTheme(next)))
    // A skipped or interrupted crossfade still applies the theme; there is nothing to report.
    transition.ready.catch(() => undefined)
    transition.finished.catch(() => undefined).finally(() => { crossfading = false })
  }, [theme, setTheme])
  return { theme, setTheme: set }
}
