"use client"

import { useEffect, useRef, useState } from "react"
import { PULL_HOLD, PULL_TRIGGER, pullOffset } from "@/shared/lib/pull"
import { cn } from "@/shared/lib/utils"

/** Movement (px) before a touch counts as a pull, so taps and sideways swipes are left alone. */
const SLOP = 10
/** The spinner stays at least this long, so a quick refresh still reads as one. */
const MIN_SPIN = 500
const SETTLE_MS = 420
const SETTLE = `transform ${SETTLE_MS}ms var(--ease-out-quint)`
const ARC = 2 * Math.PI * 9

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** True when the touch began inside something that scrolls on its own and isn't at its top: that pull is its scroll. */
function scrolledInside(target: Element, root: Element) {
  for (let el: Element | null = target; el && el !== root; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el)
    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollTop > 0) return true
  }
  return false
}

/**
 * Pull down at the top of the page to refresh, as in Instagram or Threads: the page follows the finger, a spinner
 * fills in as it goes, and letting go past the mark runs `onRefresh` in place, with no reload. Touch only; sheets and
 * dialogs, anything marked `data-no-pull`, and lists that scroll on their own keep their gestures.
 */
export function PullToRefresh({ onRefresh, disabled = false, className, children }: {
  onRefresh: () => Promise<unknown>
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  const page = useRef<HTMLDivElement>(null)
  const spinner = useRef<HTMLDivElement>(null)
  const arc = useRef<SVGCircleElement>(null)
  const refresh = useRef(onRefresh)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { refresh.current = onRefresh }, [onRefresh])

  useEffect(() => {
    const root = page.current
    if (disabled || !root) return
    let startX = 0
    let startY = 0
    let tracking = false
    let pulling = false
    let busy = false
    let offset = 0

    // Written straight to the elements, not through React, so the page keeps up with the finger.
    const paint = (y: number, settle: boolean) => {
      offset = y
      const progress = Math.min(y / PULL_TRIGGER, 1)
      root.style.transition = settle ? SETTLE : "none"
      // No transform at rest: a transformed page would become the frame for everything fixed inside it.
      root.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : ""
      if (spinner.current) {
        spinner.current.style.transition = settle ? `${SETTLE}, opacity 200ms ease-out` : "none"
        spinner.current.style.opacity = String(progress)
        spinner.current.style.transform = `translate3d(-50%, ${(progress - 1) * 18}px, 0) scale(${0.7 + 0.3 * progress})`
      }
      if (arc.current && !busy) {
        arc.current.style.strokeDasharray = `${progress * 0.8 * ARC} ${ARC}`
        arc.current.style.transform = `rotate(${progress * 270 - 90}deg)`
      }
    }

    const run = async () => {
      busy = true
      setRefreshing(true)
      paint(PULL_HOLD, true)
      try {
        await Promise.all([refresh.current(), wait(MIN_SPIN)])
      } finally {
        // The spinner keeps turning while the page slides back, then stops out of sight.
        paint(0, true)
        await wait(SETTLE_MS)
        setRefreshing(false)
        busy = false
      }
    }

    const onStart = (e: TouchEvent) => {
      tracking = false
      if (busy || e.touches.length !== 1 || window.scrollY > 0) return
      const target = e.target as Element
      if (!root.contains(target) || target.closest('[role="dialog"], [data-no-pull]') || scrolledInside(target, root)) return
      tracking = true
      pulling = false
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking) return
      const { clientX, clientY } = e.touches[0]
      if (!pulling) {
        const dx = clientX - startX
        const dy = clientY - startY
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        // Up, sideways, or the page scrolled after all: not a pull.
        if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
          tracking = false
          return
        }
        pulling = true
        startY = clientY
      }
      const before = offset
      paint(pullOffset(clientY - startY), false)
      // A tick as the pull passes the mark (Android; browsers allow it only once the page has been tapped).
      if (before < PULL_TRIGGER && offset >= PULL_TRIGGER && navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8)
    }

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (!pulling) return
      pulling = false
      if (e.type === "touchend" && offset >= PULL_TRIGGER) void run()
      else paint(0, true)
    }

    document.addEventListener("touchstart", onStart, { passive: true })
    document.addEventListener("touchmove", onMove, { passive: true })
    document.addEventListener("touchend", onEnd, { passive: true })
    document.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      document.removeEventListener("touchstart", onStart)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", onEnd)
      document.removeEventListener("touchcancel", onEnd)
      root.style.transform = ""
      root.style.transition = ""
    }
  }, [disabled])

  return (
    <>
      <div ref={spinner} aria-hidden style={{ transform: "translate3d(-50%, -18px, 0) scale(0.7)" }}
        className="pointer-events-none fixed top-[calc(var(--top-inset)+0.25rem)] left-1/2 z-40 flex size-9 items-center justify-center rounded-full bg-card opacity-0 shadow-(--shadow-card)">
        <svg viewBox="0 0 24 24" className={cn("size-5 text-primary", refreshing && "animate-spin")}>
          <circle ref={arc} cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            style={{ transformOrigin: "center", strokeDasharray: refreshing ? `${0.75 * ARC} ${ARC}` : `0 ${ARC}` }} />
        </svg>
      </div>
      <span className="sr-only" role="status">{refreshing ? "Refreshing" : ""}</span>
      <div ref={page} className={className}>{children}</div>
    </>
  )
}
