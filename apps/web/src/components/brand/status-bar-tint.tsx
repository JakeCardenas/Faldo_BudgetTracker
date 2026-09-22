"use client"

import { useEffect, useSyncExternalStore } from "react"

function subscribe(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true })
  return () => window.removeEventListener("scroll", callback)
}

/**
 * Paints the strip under the iPhone status bar in the green band's colour while the band is on screen,
 * so the phone doesn't draw its pale, blurred page-colour tint over the green. Safari reads the colour
 * from a fixed element at the top edge (and from theme-color on older versions). Once the band has
 * scrolled away the strip goes, and the normal page colour returns.
 */
export function StatusBarTint({ from, to }: { from: string; to: string }) {
  const atTop = useSyncExternalStore(subscribe, () => window.scrollY < 180, () => true)

  useEffect(() => {
    if (!atTop) return
    // Our own tag goes first in <head>, so it wins over the app-wide ones even when Next.js re-renders them.
    const meta = document.createElement("meta")
    meta.name = "theme-color"
    meta.content = from
    document.head.prepend(meta)
    return () => meta.remove()
  }, [from, atTop])

  if (!atTop) return null
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[env(safe-area-inset-top)] lg:hidden"
      style={{ background: `linear-gradient(90deg, ${from}, color-mix(in oklab, ${from} 75%, ${to}))` }} />
  )
}
