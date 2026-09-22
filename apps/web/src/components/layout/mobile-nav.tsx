"use client"

import Link from "next/link"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { TAB_ITEMS, activeTabIndex } from "@/components/layout/nav"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

export function initialsOf(name?: string | null) {
  return (name ?? "?").split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?"
}

/** Inner padding of the capsule, matching p-1. */
const PAD = 4

interface SpringConfig { stiffness: number; damping: number }
/** Gliding to a tab: about a 0.38s response with a little give, like the system tab bar. */
const GLIDE: SpringConfig = { stiffness: 300, damping: 28 }
/** Following a finger: tight enough to stay under it, soft enough never to jitter. */
const FOLLOW: SpringConfig = { stiffness: 1200, damping: 69 }
/** Lifting into a bubble: quick and slightly springy. */
const LIFT: SpringConfig = { stiffness: 520, damping: 30 }
/** Settling back into the lens: calmer, no bounce you notice. */
const SETTLE: SpringConfig = { stiffness: 320, damping: 30 }

/** A damped spring. Physics rather than keyframes, so a new target mid-motion keeps its speed. */
class Spring {
  value: number
  target: number
  velocity = 0
  config: SpringConfig
  constructor(value: number, config: SpringConfig) {
    this.value = value
    this.target = value
    this.config = config
  }
  step(dt: number) {
    const { stiffness, damping } = this.config
    this.velocity += (-stiffness * (this.value - this.target) - damping * this.velocity) * dt
    this.value += this.velocity * dt
  }
  resting(precision: number) {
    return Math.abs(this.value - this.target) < precision && Math.abs(this.velocity) < precision * 10
  }
  snap(value = this.target) {
    this.value = this.target = value
    this.velocity = 0
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Floating navigation for phones and tablets: the four tabs in one liquid-glass capsule, fixed above the
 * home indicator, with the + (record money) as its own glass circle beside it.
 *
 * The selected tab sits in a grey lens set into the glass. Touching the bar lifts the lens into a clear
 * bubble that swells past the bar's edges; it follows the finger across the tabs, magnifying whatever it
 * passes over, and on release glides onto that tab and settles back into a grey lens. A plain tap does
 * the same in one motion. The motion runs on springs, frame by frame, and writes styles directly so it
 * stays smooth while the next page renders.
 */
export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { openAddMenu } = useAppActions()
  const active = activeTabIndex(pathname)
  const [choice, setChoice] = useState<{ index: number; from: string } | null>(null)

  const bar = useRef<HTMLDivElement>(null)
  const lens = useRef<HTMLSpanElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const rest = useRef<HTMLSpanElement>(null)
  const clear = useRef<HTMLSpanElement>(null)
  const icons = useRef<(HTMLSpanElement | null)[]>([])
  const x = useRef(new Spring(0, GLIDE))
  const lift = useRef(new Spring(0, LIFT))
  const slot = useRef(0)
  const box = useRef<DOMRect | null>(null)
  const frame = useRef(0)
  const dragging = useRef(false)
  const landTimer = useRef<number | undefined>(undefined)
  const activeRef = useRef(active)
  const hidden = pathname.startsWith("/assistant")

  const paint = useCallback(() => {
    const l = lift.current.value
    const shown = clamp01(l)
    if (lens.current) lens.current.style.transform = `translate3d(${x.current.value}px,0,0)`
    if (bubble.current) bubble.current.style.transform = `scale(${1 + 0.16 * l},${1 + 0.34 * l})`
    if (rest.current) rest.current.style.opacity = String(1 - shown)
    if (clear.current) clear.current.style.opacity = String(shown)
    icons.current.forEach((icon, i) => {
      if (!icon || !slot.current) return
      const nearness = Math.max(0, 1 - Math.abs(x.current.value - i * slot.current) / slot.current)
      icon.style.transform = `scale(${1 + 0.14 * shown * nearness})`
    })
  }, [])

  const run = useCallback(() => {
    if (frame.current) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      x.current.snap()
      lift.current.snap()
      paint()
      return
    }
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(0.034, (now - last) / 1000)
      last = now
      for (let i = 0; i < 4; i++) {
        x.current.step(dt / 4)
        lift.current.step(dt / 4)
      }
      const settled = x.current.resting(0.1) && lift.current.resting(0.002)
      if (settled && !dragging.current) {
        x.current.snap()
        lift.current.snap()
        paint()
        frame.current = 0
        return
      }
      paint()
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [paint])

  // Measure the tabs, place the lens before the first paint and keep it placed when the bar resizes.
  useLayoutEffect(() => {
    const node = bar.current
    if (!node) return
    const measure = () => {
      slot.current = (node.clientWidth - PAD * 2) / TAB_ITEMS.length
      if (!dragging.current) x.current.snap(Math.max(activeRef.current, 0) * slot.current)
      paint()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [paint, hidden])

  // When the page changes by any route (a link, back, a deep link), glide the lens to its tab.
  useEffect(() => {
    activeRef.current = active
    if (dragging.current || active < 0 || !slot.current) return
    x.current.config = GLIDE
    x.current.target = active * slot.current
    run()
  }, [active, run])

  useEffect(() => () => {
    cancelAnimationFrame(frame.current)
    window.clearTimeout(landTimer.current)
  }, [])

  if (hidden) return null

  // The tab under the finger, or the one just chosen while its page loads; otherwise the current tab.
  const selected = choice?.from === pathname ? choice.index : active

  function under(clientX: number) {
    const b = box.current!
    const within = Math.min(Math.max(clientX - b.left - PAD, 0), b.width - PAD * 2 - 0.01)
    return {
      index: Math.floor(within / slot.current),
      x: Math.min(Math.max(clientX - b.left - PAD - slot.current / 2, 0), b.width - PAD * 2 - slot.current),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !slot.current) return
    // Keep receiving the finger's moves even when it slides off a tab. Capture can fail for synthetic events.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* moves still arrive while over the bar */ }
    box.current = e.currentTarget.getBoundingClientRect()
    dragging.current = true
    window.clearTimeout(landTimer.current)
    const at = under(e.clientX)
    x.current.config = FOLLOW
    x.current.target = at.x
    lift.current.config = LIFT
    lift.current.target = 1
    setChoice({ index: at.index, from: pathname })
    run()
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    const at = under(e.clientX)
    x.current.target = at.x
    if (at.index !== choice?.index) setChoice({ index: at.index, from: pathname })
    run()
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    const { index } = under(e.clientX)
    x.current.config = GLIDE
    x.current.target = index * slot.current
    landTimer.current = window.setTimeout(() => {
      lift.current.config = SETTLE
      lift.current.target = 0
      run()
    }, 110)
    setChoice({ index, from: pathname })
    play("tap")
    if (index !== active) router.push(TAB_ITEMS[index].href)
    run()
  }
  function onPointerCancel() {
    if (!dragging.current) return
    dragging.current = false
    x.current.config = GLIDE
    x.current.target = Math.max(active, 0) * slot.current
    lift.current.config = SETTLE
    lift.current.target = 0
    setChoice(null)
    run()
  }

  return (
    <nav aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-5 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)-0.625rem))] lg:hidden">
      <div className="mx-auto flex max-w-[30rem] items-center gap-3">
        <div ref={bar} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          className="pointer-events-auto relative h-[3.875rem] min-w-0 flex-1 touch-none select-none">
          {/* The glass itself. */}
          <span aria-hidden className="glass-float absolute inset-0 rounded-full" />

          {/* The lens, moved and shaped frame by frame (see paint). */}
          <span ref={lens} aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-1 w-[calc((100%-0.5rem)/4)] transition-opacity duration-200 will-change-transform",
            selected < 0 && "opacity-0")}>
            <span ref={bubble} className="absolute inset-x-0 inset-y-1 will-change-transform">
              <span ref={rest} className="absolute inset-0 rounded-full bg-(--tab-lens)" />
              <span ref={clear} className="absolute inset-0 rounded-full bg-white/14 opacity-0 shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.95),inset_0_-3px_8px_rgb(255_255_255/0.45),inset_0_3px_6px_rgb(255_255_255/0.5),0_8px_22px_-8px_rgb(16_36_24/0.35)] dark:bg-white/10 dark:shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.4),inset_0_-3px_8px_rgb(255_255_255/0.12),0_8px_22px_-8px_rgb(0_0_0/0.6)]" />
            </span>
          </span>

          <div className="absolute inset-0 grid grid-cols-4 p-1">
            {TAB_ITEMS.map((item, i) => {
              const Icon = item.icon
              const on = i === selected
              return (
                // Touch and mouse are handled by the bar above (so a finger can slide between tabs);
                // the link itself keeps keyboard and screen reader navigation working.
                <Link key={item.href} href={item.href} aria-current={i === active ? "page" : undefined} draggable={false}
                  onClick={(e) => {
                    if (e.detail > 0) { e.preventDefault(); return }
                    setChoice({ index: i, from: pathname })
                    play("tap")
                  }}
                  className={cn("relative flex min-w-0 flex-col items-center justify-center gap-[3px] rounded-full text-[0.6875rem] font-medium tracking-[-0.005em] transition-colors duration-200 outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring/50",
                    on ? "text-primary" : "text-foreground/80")}>
                  <span ref={(node) => { icons.current[i] = node }} className="flex flex-col items-center gap-[3px] will-change-transform">
                    <Icon className="size-6" strokeWidth={on ? 2 : 1.7} />
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>

        <button type="button" onClick={openAddMenu} aria-label="Add money in or out" aria-haspopup="dialog"
          className="glass-float pointer-events-auto flex size-[3.875rem] shrink-0 items-center justify-center rounded-full text-foreground transition-[scale] duration-300 ease-(--ease-spring) active:scale-[0.9]">
          <Plus className="size-7" strokeWidth={2.4} />
        </button>
      </div>
    </nav>
  )
}
