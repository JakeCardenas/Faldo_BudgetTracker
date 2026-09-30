"use client"

import Link from "next/link"
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { useAppActions } from "@/shared/lib/app-actions"
import { TAB_ITEMS, activeTabIndex, type TabItem } from "@/shared/config/nav"
import { motionReduced } from "@/shared/lib/motion"
import { play } from "@/shared/lib/sound"
import { Spring, aim, clamp, type SpringConfig } from "@/shared/lib/spring"
import { cn } from "@/shared/lib/utils"

export function initialsOf(name?: string | null) {
  return (name ?? "?").split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?"
}

/** Inner padding of the capsule: the lens sits this far inside its edge. */
const PAD = 4
/** The lens at its widest (83pt on a 347pt bar). */
const LENS_MAX = 83
/** The bar's five places: the four tabs, with the + in the middle. */
const SLOTS = 5
const ADD_SLOT = 2
/** How far a finger moves before a press becomes a drag. */
const SLOP = 6
/** Scrolling down this far sends the bar away; scrolling back up this far brings it back. */
const HIDE_AFTER = 72
const SHOW_AFTER = 28
/** Near the top of a page the bar always shows. */
const TOP_ZONE = 48
/** How far the lens stretches along its path at speed (a share of its width), and how much it grows when pressed. */
const STRETCH = 0.3
const LIFT_GROW = 0.07

const slotOf = (tab: number) => (tab < 0 ? -1 : tab < ADD_SLOT ? tab : tab + 1)
const tabOf = (slot: number) => (slot < ADD_SLOT ? slot : slot === ADD_SLOT ? -1 : slot - 1)

/** Gliding to a tab: about a 0.38s response with a little give, like the system tab bar. */
const GLIDE: SpringConfig = { stiffness: 300, damping: 28 }
/** Following a finger: tight enough to stay under it, soft enough never to jitter. */
const FOLLOW: SpringConfig = { stiffness: 1200, damping: 69 }
/** The lens swelling under a finger and settling back: quick, with a hint of give. */
const LIFT: SpringConfig = { stiffness: 620, damping: 36 }

/** A tab's icon drawn solid, with its inner details cut out so they show the lens through them. */
function FilledIcon({ item }: { item: TabItem }) {
  const Icon = item.icon
  const id = `tab-fill-${useId().replace(/[^\w-]/g, "")}`
  return (
    <svg viewBox="0 0 24 24" className="size-[1.375rem] overflow-visible">
      <mask id={id} maskUnits="userSpaceOnUse" x="-4" y="-4" width="32" height="32">
        <Icon size={24} color="#fff" fill="#fff" strokeWidth={2} />
        {item.cutout && <Icon size={24} color="#000" strokeWidth={2} className={item.cutout} />}
      </mask>
      <rect x="-4" y="-4" width="32" height="32" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  )
}

/**
 * The icon row, laid out so each icon sits at the centre of the lens when the lens rests on it, each with its name
 * under it: Wallet, Plan and History aren't obvious from a wallet, a calendar and a clock alone. The copy under the
 * lens is filled and in Faldo's green; both copies set the names in the same weight, so a name half under the moving
 * lens still lines up.
 */
function IconRow({ filled }: { filled?: boolean }) {
  return (
    <div className={cn("absolute inset-y-0 left-[calc(4px+var(--lens)/2-var(--step)/2)] grid w-[calc(var(--step)*5)] grid-cols-5", filled ? "text-primary" : "text-foreground/70")}>
      {Array.from({ length: SLOTS }, (_, slot) => {
        const item = TAB_ITEMS[tabOf(slot)]
        const Icon = item?.icon
        return (
          <span key={slot} className="flex flex-col items-center justify-center gap-1">
            {!item ? <Plus className="size-[1.375rem]" strokeWidth={2} />
              : filled ? <FilledIcon item={item} />
              : Icon && <Icon className="size-[1.375rem]" strokeWidth={2} />}
            <span className="text-[0.6875rem] leading-none font-semibold tracking-[-0.01em]">{item?.label ?? "Add"}</span>
          </span>
        )
      })}
    </div>
  )
}

/**
 * Floating navigation for phones and tablets: one frosted capsule with the four tabs and the + (record money) in
 * the middle, each named under its icon.
 *
 * The selected tab sits in a sage lens set into the glass, and whatever the lens covers is drawn filled in green.
 * The lens is a little liquid: it stretches along its path while it moves (more the faster it goes) and settles
 * back to its shape as it lands, and it swells slightly the moment a finger touches the bar. Slide a finger along
 * the bar and the lens follows it, filling each icon as it passes; let go and it settles on that tab and opens it.
 *
 * Scroll down a page and the capsule draws in toward its right end until it is exactly the round + that takes its
 * place in the corner; scroll back up and it grows out of that + again, a touch past its size before settling. That
 * handover is CSS (.nav-away in globals.css), so the system runs it off the main thread and a quick reversal picks
 * up from wherever it is. The lens moves on springs, frame by frame, writing styles directly so it stays smooth while
 * the next page renders. With reduced motion the lens goes straight to its place and the handover is a plain swap.
 */
export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { openAddMenu } = useAppActions()
  const active = activeTabIndex(pathname)
  const activeSlot = slotOf(active)
  const hidden = pathname.startsWith("/assistant")
  // Away belongs to the page it happened on, so a new page always starts with the bar in view.
  const [awayOn, setAwayOn] = useState<string | null>(null)
  const away = awayOn === pathname

  const bar = useRef<HTMLDivElement>(null)
  const lens = useRef<HTMLSpanElement>(null)
  const outline = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const x = useRef(new Spring(PAD, GLIDE))
  const lift = useRef(new Spring(0, LIFT))
  const geo = useRef({ width: 0, lens: LENS_MAX, step: 0 })
  const box = useRef<DOMRect | null>(null)
  const press = useRef<{ startX: number; dragging: boolean } | null>(null)
  const lit = useRef(activeSlot >= 0)
  const frame = useRef(0)
  const lastTick = useRef(0)
  const activeRef = useRef(activeSlot)

  const paint = useCallback(() => {
    const { width, lens: size } = geo.current
    // Speed stretches the lens along its path and thins it a touch, like a drop of water; a finger swells it.
    const stretch = clamp(Math.abs(x.current.velocity) / 2600, 0, 1) * STRETCH
    const grow = 1 + LIFT_GROW * Math.max(0, lift.current.value)
    const sx = (1 + stretch) * grow
    const sy = (1 - stretch * 0.22) * grow
    const centre = x.current.value + size / 2
    const left = clamp(centre - (size * sx) / 2, 0, width)
    const right = clamp(centre + (size * sx) / 2, 0, width)
    if (lens.current) lens.current.style.transform = `translate3d(${x.current.value}px,0,0) scale(${sx},${sy})`
    // The filled icons show only inside the lens, the outlined ones only outside it.
    if (fill.current) fill.current.style.clipPath = `inset(0 ${width - right}px 0 ${left}px)`
    if (outline.current) {
      const mask = lit.current ? `linear-gradient(90deg,#000 ${left}px,transparent ${left}px,transparent ${right}px,#000 ${right}px)` : "none"
      outline.current.style.setProperty("mask-image", mask)
      outline.current.style.setProperty("-webkit-mask-image", mask)
    }
  }, [])

  const run = useCallback(() => {
    // A loop that has not ticked for a while was dropped (the page was suspended, say): start afresh.
    if (frame.current && performance.now() - lastTick.current < 250) return
    cancelAnimationFrame(frame.current)
    // Time comes only from the frames themselves, so no clock can disagree with them.
    let last = -1
    lastTick.current = performance.now()
    const tick = (now: number) => {
      lastTick.current = performance.now()
      const dt = last < 0 ? 1 / 60 : Math.min(0.034, Math.max(0, now - last) / 1000)
      last = now
      for (let i = 0; i < 4; i++) {
        x.current.step(dt / 4)
        lift.current.step(dt / 4)
      }
      if (x.current.resting(0.1) && lift.current.resting(0.002) && !press.current?.dragging) {
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

  /** Moves the lens on a spring, or, with reduced motion, straight to where it is going. */
  const moveTo = useCallback((target: number, config: SpringConfig) => {
    if (aim(x.current, target, config, motionReduced())) {
      run()
      return
    }
    cancelAnimationFrame(frame.current)
    frame.current = 0
    paint()
  }, [paint, run])

  /** A finger on the bar swells the lens; lifting it lets the lens settle. Reduced motion skips it. */
  const swell = useCallback((on: boolean) => {
    if (motionReduced()) return
    lift.current.target = on ? 1 : 0
    run()
  }, [run])

  /** Show or hide the lens (and the filled icons with it), fading. */
  const light = useCallback((on: boolean) => {
    lit.current = on
    if (lens.current) lens.current.style.opacity = on ? "1" : "0"
    if (fill.current) fill.current.style.opacity = on ? "1" : "0"
    paint()
  }, [paint])

  const glideTo = useCallback((slot: number) => {
    if (slot < 0) { light(false); return }
    const target = PAD + slot * geo.current.step
    if (!lit.current) {
      x.current.snap(target)
      light(true)
      return
    }
    moveTo(target, GLIDE)
  }, [light, moveTo])

  // Measure the bar, lay out the lens and icons before the first paint, and again whenever it resizes.
  useLayoutEffect(() => {
    const node = bar.current
    if (!node) return
    const measure = () => {
      const width = node.clientWidth
      const size = Math.min(LENS_MAX, ((width - PAD * 2) / SLOTS) * 1.3)
      const step = (width - PAD * 2 - size) / (SLOTS - 1)
      geo.current = { width, lens: size, step }
      node.style.setProperty("--lens", `${size}px`)
      node.style.setProperty("--step", `${step}px`)
      if (press.current?.dragging) { paint(); return }
      x.current.snap(PAD + Math.max(activeRef.current, 0) * step)
      light(activeRef.current >= 0)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [light, paint, hidden])

  // When the page changes by any route (a tab, a link, back, a deep link), move the lens to its tab.
  useEffect(() => {
    activeRef.current = activeSlot
    if (press.current?.dragging || !geo.current.step) return
    glideTo(activeSlot)
  }, [activeSlot, glideTo])

  // Scrolling down sends the bar away; scrolling up, or reaching the top, brings it back.
  useEffect(() => {
    if (hidden) return
    let last = window.scrollY
    let down = 0
    let up = 0
    const setAway = (on: boolean) => setAwayOn(on ? pathname : null)
    const onScroll = () => {
      const y = window.scrollY
      const dy = y - last
      last = y
      if (y < TOP_ZONE) {
        down = up = 0
        setAway(false)
        return
      }
      // The bounce past the end of a page is not the reader scrolling back up.
      if (dy < 0 && y >= document.documentElement.scrollHeight - window.innerHeight - 1) return
      if (dy > 0) {
        down += dy
        up = 0
        if (down > HIDE_AFTER) setAway(true)
      } else if (dy < 0) {
        up -= dy
        down = 0
        if (up > SHOW_AFTER) setAway(false)
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [hidden, pathname])

  useEffect(() => () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }, [])

  if (hidden) return null

  function slotAt(clientX: number) {
    const { step, lens: size } = geo.current
    return clamp(Math.round((clientX - box.current!.left - PAD - size / 2) / step), 0, SLOTS - 1)
  }
  function lensAt(clientX: number) {
    const { width, lens: size } = geo.current
    return clamp(clientX - box.current!.left - size / 2, PAD, width - PAD - size)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !geo.current.step) return
    // Keep receiving the finger's moves even when it slides off the bar. Capture can fail for synthetic events.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* moves still arrive while over the bar */ }
    box.current = e.currentTarget.getBoundingClientRect()
    press.current = { startX: e.clientX, dragging: false }
    // Answer the touch at once, before anything is decided: the lens swells under the finger.
    swell(true)
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = press.current
    if (!p) return
    if (!p.dragging) {
      if (Math.abs(e.clientX - p.startX) < SLOP) return
      p.dragging = true
      if (!lit.current) {
        x.current.snap(lensAt(e.clientX))
        light(true)
      }
    }
    moveTo(lensAt(e.clientX), FOLLOW)
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!press.current) return
    press.current = null
    swell(false)
    const slot = slotAt(e.clientX)
    play("tap")
    if (slot === ADD_SLOT) {
      glideTo(activeRef.current)
      openAddMenu()
      return
    }
    glideTo(slot)
    const tab = tabOf(slot)
    if (tab !== active) router.push(TAB_ITEMS[tab].href)
  }
  function onPointerCancel() {
    if (!press.current) return
    press.current = null
    swell(false)
    glideTo(activeRef.current)
  }

  return (
    <nav aria-label="Main"
      className={cn("pointer-events-none fixed inset-x-0 bottom-0 z-40 px-5 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)-0.75rem))] lg:hidden", away && "nav-away")}>
      <div className="relative mx-auto max-w-[30rem]">
        <div ref={bar} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          onFocus={() => setAwayOn(null)}
          className="nav-bar pointer-events-auto relative h-[3.875rem] touch-none select-none [-webkit-touch-callout:none]">
          {/* The shadow on its own layer, so the glass can draw in to a circle without clipping it. */}
          <span aria-hidden className="nav-shadow absolute inset-0 rounded-full" />
          <span aria-hidden className="nav-glass nav-glass-flat nav-shape absolute inset-0 rounded-full" />
          <div className="nav-content absolute inset-0">
            <span ref={lens} aria-hidden className="nav-lens pointer-events-none absolute inset-y-1 left-0 w-(--lens) origin-center rounded-full transition-opacity duration-200 will-change-transform" />
            <div ref={outline} aria-hidden className="pointer-events-none absolute inset-0"><IconRow /></div>
            <div ref={fill} aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-200"><IconRow filled /></div>

            {/* Touch and mouse are handled by the bar above (so a finger can slide between tabs); these keep
                keyboard and screen reader navigation working. */}
            <div className="absolute inset-y-0 left-[calc(4px+var(--lens)/2-var(--step)/2)] grid w-[calc(var(--step)*5)] grid-cols-5">
              {Array.from({ length: SLOTS }, (_, slot) => {
                const tab = tabOf(slot)
                const ring = "rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
                if (tab < 0) {
                  return (
                    <button key="add" type="button" aria-label="Add money in or out" aria-haspopup="dialog" className={ring}
                      onClick={(e) => { if (e.detail === 0) openAddMenu() }} />
                  )
                }
                const item = TAB_ITEMS[tab]
                return (
                  <Link key={item.href} href={item.href} aria-label={item.label} aria-current={tab === active ? "page" : undefined} draggable={false}
                    onClick={(e) => {
                      if (e.detail > 0) { e.preventDefault(); return }
                      play("tap")
                    }}
                    className={ring} />
                )
              })}
            </div>
          </div>
        </div>

        {/* The + that stands in for the bar while it is away (.nav-plus in globals.css). */}
        <button type="button" onClick={openAddMenu} aria-label="Add money in or out" aria-haspopup="dialog" aria-hidden={!away} tabIndex={away ? 0 : -1}
          className="nav-glass nav-plus absolute right-0 bottom-0 flex size-[3.875rem] items-center justify-center rounded-full text-foreground will-change-[opacity,scale] active:scale-[0.9]">
          <Plus className="size-7" strokeWidth={2} />
        </button>
      </div>
    </nav>
  )
}
