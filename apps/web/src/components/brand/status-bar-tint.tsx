"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"

function subscribe(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true })
  window.addEventListener("resize", callback)
  return () => {
    window.removeEventListener("scroll", callback)
    window.removeEventListener("resize", callback)
  }
}

/**
 * Tints the strip under the iPhone status bar in the band's colour while the band is under it. Render it inside the
 * band (which is positioned).
 *
 * iOS 26 Safari and home screen web apps ignore theme-color and paint that strip (with its soft blurred
 * edge) from the body's background colour, repainting live when it changes. The app draws its own
 * canvas above the body, so this colour only shows in the strip and in overscroll. theme-color is still
 * set for older Safari and Android. The strip keeps the band's colour until the band's lower edge has scrolled up
 * past it, then returns to the page colour, so neither colour ever sits over the other as a line.
 */
export function StatusBarTint({ color }: { color: string }) {
  // As tall as the strip (the status bar plus iOS's blurred edge), at the top of the band.
  const probe = useRef<HTMLSpanElement>(null)
  const underBand = useSyncExternalStore(subscribe, () => {
    const band = probe.current?.parentElement
    return !band || band.getBoundingClientRect().bottom > probe.current!.offsetHeight
  }, () => true)

  useEffect(() => {
    if (!underBand) return
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
  }, [color, underBand])

  return <span ref={probe} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 h-(--top-inset) w-px" />
}
