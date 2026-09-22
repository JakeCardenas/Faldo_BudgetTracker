"use client"

import { useEffect, useSyncExternalStore } from "react"

function subscribe(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true })
  return () => window.removeEventListener("scroll", callback)
}

/**
 * Tints the strip under the iPhone status bar in the green band's colour while the band is on screen.
 *
 * iOS 26 Safari and home screen web apps ignore theme-color and paint that strip (with its soft blurred
 * edge) from the body's background colour, repainting live when it changes. The app draws its own
 * canvas above the body, so this colour only shows in the strip and in overscroll. theme-color is still
 * set for older Safari and Android. Once the band scrolls away, both return to the page colour.
 */
export function StatusBarTint({ color }: { color: string }) {
  const atTop = useSyncExternalStore(subscribe, () => window.scrollY < 180, () => true)

  useEffect(() => {
    if (!atTop) return
    const body = document.body
    const previous = body.style.backgroundColor
    body.style.backgroundColor = color
    // Our own tag goes first in <head>, so it wins over the app-wide ones even when Next.js re-renders them.
    const meta = document.createElement("meta")
    meta.name = "theme-color"
    meta.content = color
    document.head.prepend(meta)
    return () => {
      body.style.backgroundColor = previous
      meta.remove()
    }
  }, [color, atTop])

  return null
}
