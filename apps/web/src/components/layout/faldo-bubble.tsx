"use client"

import Image from "next/image"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { X } from "lucide-react"
import { toast } from "sonner"
import { useNotifications } from "@/components/layout/notifications"
import { bubbleHintSeen, markBubbleHintSeen, readBubbleSpot, saveBubbleSpot, setBubbleShown, useBubbleShown } from "@/lib/bubble"
import { play } from "@/lib/sound"
import { Spring, clamp, type SpringConfig } from "@/lib/spring"
import { cn } from "@/lib/utils"

/** The bubble's size, and its gap to the side of the screen when it rests there. */
const SIZE = 56
const EDGE = 8
/** How far a finger moves before a press becomes a drag. */
const SLOP = 5
/** How close to the × the bubble gets pulled onto it. */
const MAGNET = 84
/** How far ahead a throw carries, in seconds of its speed. */
const THROW = 0.22
/** Following the finger: stiff enough to feel held, soft enough never to jitter. */
const DRAG: SpringConfig = { stiffness: 2000, damping: 90 }
/** Settling against a side after you let go: a little bounce, like Messenger's chat heads. */
const SNAP: SpringConfig = { stiffness: 380, damping: 26 }
/** Pulled onto the ×. */
const PULL: SpringConfig = { stiffness: 700, damping: 42 }
/** Pressing, lifting and leaving. */
const SCALE: SpringConfig = { stiffness: 520, damping: 30 }

type Sample = { x: number; y: number; t: number }

/**
 * The Faldo bubble: a floating chat head, like Messenger's, with Faldo waving. Drag it anywhere; let go
 * and it springs to the nearer side, carried by how you threw it. Tap it to ask Faldo. Drag it onto
 * the × that rises at the bottom to put it away (Settings brings it back). A red badge counts what
 * needs a look, the same as the bell. It rests between the status bar and the tab bar, remembers where
 * you left it on this device, and moves on springs, frame by frame, like the tab bar's lens.
 */
export function FaldoBubble() {
  const pathname = usePathname()
  const router = useRouter()
  const shown = useBubbleShown()
  const { count } = useNotifications()
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)
  const [hint, setHint] = useState(false)
  const [side, setSide] = useState<"left" | "right">("right")
  const hidden = !shown || pathname.startsWith("/assistant")

  const holder = useRef<HTMLDivElement>(null)
  const head = useRef<HTMLButtonElement>(null)
  const target = useRef<HTMLDivElement>(null)
  const topProbe = useRef<HTMLDivElement>(null)
  const bottomProbe = useRef<HTMLDivElement>(null)
  const x = useRef(new Spring(-200, SNAP))
  const y = useRef(new Spring(-200, SNAP))
  const scale = useRef(new Spring(1, SCALE))
  const press = useRef<{ start: Sample; dx: number; dy: number; samples: Sample[]; moved: boolean; over: boolean } | null>(null)
  const frame = useRef(0)
  const lastTick = useRef(0)

  const paint = useCallback(() => {
    // The holder rests in the bottom-left corner; y counts from the top of the screen.
    const fromBottom = y.current.value - (document.documentElement.clientHeight - SIZE)
    if (holder.current) holder.current.style.transform = `translate3d(${x.current.value}px,${fromBottom}px,0)`
    if (head.current) head.current.style.transform = `scale(${Math.max(0, scale.current.value)})`
  }, [])

  const run = useCallback(() => {
    // A loop that has not ticked for a while was dropped (the page was suspended, say): start afresh.
    if (frame.current && performance.now() - lastTick.current < 250) return
    cancelAnimationFrame(frame.current)
    const springs = [x.current, y.current, scale.current]
    let last = -1
    lastTick.current = performance.now()
    const tick = (now: number) => {
      lastTick.current = performance.now()
      const dt = last < 0 ? 1 / 60 : Math.min(0.034, Math.max(0, now - last) / 1000)
      last = now
      for (let i = 0; i < 4; i++) springs.forEach((s) => s.step(dt / 4))
      if (!press.current && x.current.resting(0.1) && y.current.resting(0.1) && scale.current.resting(0.001)) {
        springs.forEach((s) => s.snap())
        paint()
        frame.current = 0
        return
      }
      paint()
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [paint])

  /** The free band: below the status bar, above the tab bar, a little in from each side. */
  const bounds = useCallback(() => {
    const width = window.innerWidth
    const top = (topProbe.current?.offsetHeight ?? 0) + 8
    const bottom = window.innerHeight - (bottomProbe.current?.offsetHeight ?? 100) - SIZE
    return { left: EDGE, right: width - EDGE - SIZE, top, bottom: Math.max(top, bottom), width }
  }, [])

  /** Where the × sits: centred, just above the tab bar. */
  const dropSpot = useCallback(() => {
    const box = target.current?.getBoundingClientRect()
    if (!box) return null
    return { x: box.left + box.width / 2 - SIZE / 2, y: box.top + box.height / 2 - SIZE / 2 }
  }, [])

  // Put the bubble where it was left, and keep it inside the free band when the screen changes size.
  useLayoutEffect(() => {
    if (hidden) return
    const place = (animate: boolean) => {
      const spot = readBubbleSpot()
      const b = bounds()
      const nextX = spot.side === "left" ? b.left : b.right
      const nextY = b.top + spot.y * (b.bottom - b.top)
      setSide(spot.side)
      if (animate) {
        x.current.config = SNAP
        y.current.config = SNAP
        x.current.target = nextX
        y.current.target = nextY
        run()
      } else {
        x.current.snap(nextX)
        y.current.snap(nextY)
        scale.current.snap(1)
        paint()
      }
    }
    place(false)
    const onResize = () => place(true)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [hidden, bounds, paint, run])

  // A one-time hint the first time the bubble appears on this device.
  useEffect(() => {
    if (hidden || bubbleHintSeen()) return
    const show = window.setTimeout(() => { setHint(true); markBubbleHintSeen() }, 1200)
    const hide = window.setTimeout(() => setHint(false), 7200)
    return () => { window.clearTimeout(show); window.clearTimeout(hide) }
  }, [hidden])

  useEffect(() => () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
  }, [])

  if (hidden) return null

  function open() {
    play("tap")
    setHint(false)
    router.push("/assistant")
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* moves still arrive while over the bubble */ }
    const start = { x: e.clientX, y: e.clientY, t: performance.now() }
    press.current = { start, dx: e.clientX - x.current.value, dy: e.clientY - y.current.value, samples: [start], moved: false, over: false }
    setHint(false)
    scale.current.target = 0.9
    run()
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const p = press.current
    if (!p) return
    const now = { x: e.clientX, y: e.clientY, t: performance.now() }
    p.samples = [...p.samples.filter((s) => now.t - s.t < 100), now]
    if (!p.moved) {
      if (Math.hypot(now.x - p.start.x, now.y - p.start.y) < SLOP) return
      p.moved = true
      setDragging(true)
      scale.current.target = 1.08
    }
    const fx = now.x - p.dx
    const fy = now.y - p.dy
    const drop = dropSpot()
    const near = drop ? Math.hypot(fx - drop.x, fy - drop.y) < MAGNET : false
    if (near !== p.over) {
      p.over = near
      setOver(near)
      if (near) play("select")
    }
    const config = near ? PULL : DRAG
    x.current.config = config
    y.current.config = config
    x.current.target = near && drop ? drop.x : fx
    y.current.target = near && drop ? drop.y : fy
    run()
  }

  function settle(p: NonNullable<typeof press.current>) {
    const b = bounds()
    const first = p.samples[0]
    const lastSample = p.samples[p.samples.length - 1]
    const span = Math.max(16, lastSample.t - first.t) / 1000
    const vx = clamp((lastSample.x - first.x) / span, -3000, 3000)
    const vy = clamp((lastSample.y - first.y) / span, -3000, 3000)
    // Throw: the side the bubble is heading for, and where along it the throw would carry it.
    const ahead = x.current.value + vx * THROW + SIZE / 2
    const nextSide = ahead < b.width / 2 ? "left" : "right"
    const nextY = clamp(y.current.value + vy * THROW, b.top, b.bottom)
    x.current.config = SNAP
    y.current.config = SNAP
    x.current.target = nextSide === "left" ? b.left : b.right
    y.current.target = nextY
    x.current.velocity = vx
    y.current.velocity = vy
    scale.current.target = 1
    setSide(nextSide)
    saveBubbleSpot({ side: nextSide, y: b.bottom > b.top ? (nextY - b.top) / (b.bottom - b.top) : 0 })
  }

  function dismiss() {
    play("close")
    scale.current.target = 0
    window.setTimeout(() => {
      setBubbleShown(false)
      toast("Faldo bubble hidden", {
        description: "Turn it back on in Settings.",
        action: { label: "Undo", onClick: () => setBubbleShown(true) },
      })
    }, 220)
  }

  function onPointerUp() {
    const p = press.current
    if (!p) return
    press.current = null
    setDragging(false)
    setOver(false)
    if (!p.moved) {
      scale.current.target = 1
      run()
      open()
      return
    }
    if (p.over) dismiss()
    else settle(p)
    run()
  }

  function onPointerCancel() {
    const p = press.current
    if (!p) return
    press.current = null
    setDragging(false)
    setOver(false)
    if (p.moved) settle(p)
    else scale.current.target = 1
    run()
  }

  return (
    // Each piece is fixed on its own and none touches the top of the screen: iOS 26 tints the status bar
    // from whatever fixed layer sits at the top, and a full-screen overlay turned it grey.
    <div className="lg:hidden">
      {/* Probes that measure the free band in CSS terms (safe areas, the tab bar's height), kept off screen. */}
      <div ref={topProbe} aria-hidden className="invisible absolute -top-[9999px] left-0 h-(--top-inset) w-px" />
      <div ref={bottomProbe} aria-hidden className="invisible absolute -top-[9999px] left-0 h-[calc(3.8125rem+max(1.25rem,env(safe-area-inset-bottom)-0.75rem)+0.75rem)] w-px" />

      {/* While you drag, the bottom of the screen darkens and the × rises above the tab bar. */}
      <div aria-hidden className={cn("pointer-events-none fixed inset-x-0 bottom-0 z-[44] h-64 bg-linear-to-t from-black/35 to-transparent transition-opacity duration-200",
        dragging ? "opacity-100" : "opacity-0")} />
      <div ref={target} aria-hidden
        className={cn("pointer-events-none fixed bottom-[calc(3.8125rem+max(1.25rem,env(safe-area-inset-bottom)-0.75rem)+1rem)] left-1/2 z-[44] flex size-[3.75rem] -translate-x-1/2 items-center justify-center rounded-full bg-black/55 text-white ring-1 ring-white/25 backdrop-blur-md transition-[opacity,translate,scale] duration-200 ease-(--ease-spring)",
          dragging ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0", over ? "scale-[1.2]" : "scale-100")}>
        <X className="size-6" strokeWidth={2.2} />
      </div>

      {/* Anchored to the bottom-left corner and moved from there (see paint). */}
      <div ref={holder} className="pointer-events-none fixed bottom-0 left-0 z-[45] size-14 will-change-transform">
        {/* The first time, Faldo says what the bubble is for. */}
        <p aria-hidden={!hint} className={cn("absolute top-1/2 w-max max-w-[13rem] -translate-y-1/2 rounded-2xl bg-primary px-3.5 py-2.5 text-[0.875rem] leading-snug font-semibold text-primary-foreground shadow-[0_10px_24px_-10px_rgb(16_36_24/0.5)] transition-[opacity,scale] duration-300 ease-(--ease-spring)",
          side === "right" ? "right-[calc(100%+0.75rem)] origin-right" : "left-[calc(100%+0.75rem)] origin-left",
          hint ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0")}>
          Tap me to ask about your money
          <span aria-hidden className={cn("absolute top-1/2 size-3 -translate-y-1/2 rotate-45 rounded-[2px] bg-primary", side === "right" ? "-right-1" : "-left-1")} />
        </p>

        <button ref={head} type="button" aria-label={count ? `Ask Faldo, ${count} ${count === 1 ? "thing" : "things"} to look at` : "Ask Faldo"}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          onClick={(e) => { if (e.detail === 0) open() }}
          className="pointer-events-auto relative block size-14 touch-none rounded-full outline-none select-none will-change-transform [-webkit-touch-callout:none] focus-visible:ring-3 focus-visible:ring-ring/60">
          <span className="absolute inset-0 overflow-hidden rounded-full bg-[linear-gradient(160deg,#6cbf86_0%,#3c8d5c_55%,#2c6a45_100%)] shadow-[0_10px_24px_-8px_rgb(0_0_0/0.45),0_2px_6px_rgb(0_0_0/0.18)] ring-2 ring-white">
            <Image src="/brand/panda/chat-head.png" alt="" width={210} height={210} sizes="56px" quality={90} draggable={false} className="size-full" />
          </span>
          {count > 0 && (
            <span aria-hidden className="tabular absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#f02849] px-1 text-[0.6875rem] font-bold text-white ring-2 ring-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
