"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { TAB_ITEMS, activeTabIndex } from "@/components/layout/nav"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

export function initialsOf(name?: string | null) {
  return (name ?? "?").split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?"
}

/**
 * The page the bar was folded on, or null. Scrolling down past the top folds the bar into one circle;
 * scrolling up, reaching the top or changing page opens it again.
 */
function useCollapsedOn() {
  const [collapsedOn, setCollapsedOn] = useState<string | null>(null)
  useEffect(() => {
    let last = window.scrollY
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        const y = window.scrollY
        const delta = y - last
        if (y < 56) {
          setCollapsedOn(null)
          last = y
        } else if (Math.abs(delta) > 8) {
          setCollapsedOn(delta > 0 ? window.location.pathname : null)
          last = y
        }
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])
  return [collapsedOn, setCollapsedOn] as const
}

/** Inner padding of the capsule, matching p-1. */
const PAD = 4
/** How long the lens stays lifted after the finger leaves, so the glide reads as one motion. */
const LAND_AFTER = 240

/** Where a finger is over the capsule: the lens position that centres on it, and the tab beneath it. */
function under(clientX: number, box: DOMRect) {
  const slot = (box.width - PAD * 2) / TAB_ITEMS.length
  const within = Math.min(Math.max(clientX - box.left - PAD, 0), box.width - PAD * 2 - 0.01)
  return {
    index: Math.floor(within / slot),
    x: Math.min(Math.max(clientX - box.left - PAD - slot / 2, 0), box.width - PAD * 2 - slot),
  }
}

/**
 * Floating navigation for phones and tablets: the four tabs in one liquid-glass capsule, with the +
 * (record money) as its own glass circle beside it.
 *
 * The selected tab sits in a grey lens set into the glass. Touching the bar lifts the lens into a clear
 * bubble that swells past the bar's edges (the bar grows slightly with it). The bubble follows your
 * finger across the tabs, magnifying the one beneath it, and when you let go it springs onto that tab
 * and settles back into a grey lens. A plain tap does the same in one motion. Scrolling down folds the
 * capsule into one circle showing where you are; it never hides.
 */
export function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { openAddMenu } = useAppActions()
  const active = activeTabIndex(pathname)
  const [pending, setPending] = useState<{ index: number; from: string } | null>(null)
  const [drag, setDrag] = useState<{ index: number; x: number } | null>(null)
  const [lifted, setLifted] = useState(false)
  const landTimer = useRef<number | undefined>(undefined)
  const box = useRef<DOMRect | null>(null)
  const [collapsedOn, setCollapsedOn] = useCollapsedOn()
  useEffect(() => () => window.clearTimeout(landTimer.current), [])
  if (pathname.startsWith("/assistant")) return null

  const collapsed = collapsedOn === pathname
  // Under the finger while dragging; the tapped tab while the next page loads; otherwise the current tab.
  const target = drag?.index ?? (pending?.from === pathname ? pending.index : active)
  const Current = TAB_ITEMS[active]?.icon ?? TAB_ITEMS[0].icon
  const expand = () => setCollapsedOn(null)

  function land(after = LAND_AFTER) {
    window.clearTimeout(landTimer.current)
    landTimer.current = window.setTimeout(() => setLifted(false), after)
  }
  function go(index: number) {
    setPending({ index, from: pathname })
    play("tap")
    if (index !== active) router.push(TAB_ITEMS[index].href)
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (collapsed || e.button !== 0) return
    // Keep receiving the finger's moves even when it slides off a tab. Capture can fail for synthetic events.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* moves still arrive while over the bar */ }
    box.current = e.currentTarget.getBoundingClientRect()
    window.clearTimeout(landTimer.current)
    setLifted(true)
    setDrag(under(e.clientX, box.current))
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || !box.current) return
    const next = under(e.clientX, box.current)
    if (next.index !== drag.index) play("select")
    setDrag(next)
  }
  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag || !box.current) return
    const { index } = under(e.clientX, box.current)
    setDrag(null)
    land()
    go(index)
  }
  function onPointerCancel() {
    setDrag(null)
    land(0)
  }

  return (
    <nav aria-label="Main" onFocusCapture={expand}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex max-w-[30rem] items-center justify-between gap-3">
        <div onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          className={cn("pointer-events-auto relative h-[3.875rem] touch-none select-none transition-[width,scale] duration-[460ms] ease-(--ease-spring)",
            lifted && !collapsed && "scale-[1.035]")}
          style={{ width: collapsed ? "3.875rem" : "calc(100% - 3.875rem - 0.75rem)" }}>
          {/* The glass itself. */}
          <span aria-hidden className="glass-float absolute inset-0 rounded-full" />

          {/* The lens: it trails the finger closely while dragging and springs onto a tab otherwise. */}
          <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-1 w-[calc((100%-0.5rem)/4)] transition-[transform,opacity]",
            drag ? "duration-150 ease-out" : "duration-[460ms] ease-(--ease-spring)",
            (target < 0 || collapsed) && "opacity-0")}
            style={{ transform: drag ? `translateX(${drag.x}px)` : `translateX(${Math.max(target, 0) * 100}%)` }}>
            <span className={cn("absolute inset-x-0 inset-y-1 rounded-full",
              lifted
                ? "scale-x-[1.16] scale-y-[1.34] bg-white/14 shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.95),inset_0_-3px_8px_rgb(255_255_255/0.45),inset_0_3px_6px_rgb(255_255_255/0.5),0_8px_22px_-8px_rgb(16_36_24/0.35)] backdrop-blur-[1.5px] backdrop-saturate-150 transition-[scale,background-color,box-shadow] duration-150 ease-out dark:bg-white/10 dark:shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.4),inset_0_-3px_8px_rgb(255_255_255/0.12),0_8px_22px_-8px_rgb(0_0_0/0.6)]"
                : "bg-(--tab-lens) transition-[scale,background-color,box-shadow] duration-[420ms] ease-(--ease-spring)")} />
          </span>

          <div aria-hidden={collapsed} className={cn("absolute inset-0 overflow-hidden rounded-full transition-opacity",
            collapsed ? "pointer-events-none opacity-0 duration-100" : "opacity-100 delay-150 duration-200")}>
            <div className="grid h-full w-[calc(100vw-2.5rem-3.875rem-0.75rem)] max-w-[calc(30rem-3.875rem-0.75rem)] grid-cols-4 p-1">
              {TAB_ITEMS.map((item, i) => {
                const Icon = item.icon
                const selected = i === target
                return (
                  // Touch and mouse are handled by the bar above (so a finger can slide between tabs);
                  // the link itself keeps keyboard and screen reader navigation working.
                  <Link key={item.href} href={item.href} aria-current={i === active ? "page" : undefined} tabIndex={collapsed ? -1 : undefined}
                    onClick={(e) => {
                      // Pointer taps were already handled by the bar; a keyboard press navigates through the link.
                      if (e.detail > 0) { e.preventDefault(); return }
                      setPending({ index: i, from: pathname })
                      play("tap")
                    }} draggable={false}
                    className={cn("relative flex min-w-0 flex-col items-center justify-center gap-[3px] rounded-full text-[0.6875rem] font-medium tracking-[-0.005em] transition-colors duration-200 outline-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-ring/50",
                      selected ? "text-primary" : "text-foreground/80")}>
                    <Icon className={cn("size-6 transition-[scale] duration-200 ease-out", selected && lifted && "scale-[1.14]")} strokeWidth={selected ? 2 : 1.7} />
                    <span className={cn("transition-[scale] duration-200 ease-out", selected && lifted && "scale-[1.08]")}>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          <button type="button" onClick={expand} aria-label="Show navigation" tabIndex={collapsed ? undefined : -1} aria-hidden={!collapsed}
            className={cn("absolute inset-0 flex items-center justify-center rounded-full text-primary transition-opacity",
              collapsed ? "opacity-100 delay-150 duration-200" : "pointer-events-none opacity-0 duration-100")}>
            <Current className="size-6" strokeWidth={2} />
          </button>
        </div>

        <button type="button" onClick={openAddMenu} aria-label="Add money in or out" aria-haspopup="dialog"
          className="glass-float pointer-events-auto flex size-[3.875rem] shrink-0 items-center justify-center rounded-full text-foreground transition-[scale] duration-300 ease-(--ease-spring) active:scale-[0.9]">
          <Plus className="size-7" strokeWidth={2.4} />
        </button>
      </div>
    </nav>
  )
}
