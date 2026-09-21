"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Plus } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { TAB_ITEMS, activeTabIndex } from "@/components/layout/nav"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

export function initialsOf(name?: string | null) {
  return (name ?? "?").split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?"
}

/**
 * The page the bar was collapsed on, or null. Scrolling down past the top collapses the bar to one
 * circle; scrolling up, reaching the top or changing page brings it back.
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

/**
 * Floating navigation for phones and tablets: the four places in one liquid-glass capsule, with the
 * + (record money) as its own glass circle beside it. The selected tab sits in a green lens that
 * springs to the tab you press and swells slightly while your finger is down. On scroll down the
 * capsule folds into a single circle showing where you are; it never hides completely.
 */
export function MobileNav() {
  const pathname = usePathname()
  const { openAddMenu } = useAppActions()
  const active = activeTabIndex(pathname)
  const [pressed, setPressed] = useState<number | null>(null)
  const [pending, setPending] = useState<{ index: number; from: string } | null>(null)
  const [collapsedOn, setCollapsedOn] = useCollapsedOn()
  if (pathname.startsWith("/assistant")) return null

  const collapsed = collapsedOn === pathname
  // While the next page loads, keep the lens on the tab that was tapped instead of snapping back.
  const target = pressed ?? (pending?.from === pathname ? pending.index : active)
  const Current = TAB_ITEMS[active]?.icon ?? TAB_ITEMS[0].icon
  const expand = () => setCollapsedOn(null)

  return (
    <nav aria-label="Main" onFocusCapture={expand}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
      <div className="mx-auto flex max-w-[30rem] items-center justify-between gap-2.5">
        <div className="glass-float pointer-events-auto relative h-[3.75rem] overflow-hidden rounded-full transition-[width] duration-[440ms] ease-(--ease-spring)"
          style={{ width: collapsed ? "3.75rem" : "calc(100% - 3.75rem - 0.625rem)" }}>
          <div aria-hidden={collapsed} className={cn("absolute inset-y-0 left-0 grid w-[calc(100vw-2.5rem-3.75rem-0.625rem)] max-w-[calc(30rem-3.75rem-0.625rem)] grid-cols-4 p-1 transition-opacity duration-150",
            collapsed && "pointer-events-none opacity-0")}
            onPointerLeave={() => setPressed(null)}>
            {/* The lens: moves with a soft spring; its swell on press is quicker, so the tap feels immediate. */}
            <span aria-hidden className={cn("pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] transition-[transform,opacity] duration-[440ms] ease-(--ease-spring)",
              target < 0 && "opacity-0")}
              style={{ transform: `translateX(${Math.max(target, 0) * 100}%)` }}>
              <span className={cn("block size-full rounded-full transition-[scale,background-color,box-shadow] duration-150 ease-out",
                pressed !== null
                  ? "scale-x-[1.06] scale-y-[1.1] bg-white/60 shadow-[inset_0_1px_0_rgb(255_255_255/0.9),inset_0_0_0_1px_rgb(255_255_255/0.7),0_4px_14px_-6px_rgb(16_36_24/0.25)] dark:bg-white/16 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),inset_0_0_0_1px_rgb(255_255_255/0.14)]"
                  : "bg-(--tab-lens) shadow-[inset_0_1px_2px_rgb(16_36_24/0.08),inset_0_-1px_0_rgb(255_255_255/0.45)] dark:shadow-[inset_0_1px_2px_rgb(0_0_0/0.3),inset_0_-1px_0_rgb(255_255_255/0.06)]")} />
            </span>
            {TAB_ITEMS.map((item, i) => {
              const Icon = item.icon
              const selected = i === active
              return (
                <Link key={item.href} href={item.href} aria-current={selected ? "page" : undefined} tabIndex={collapsed ? -1 : undefined}
                  onPointerDown={() => setPressed(i)} onPointerUp={() => setPressed(null)} onPointerCancel={() => setPressed(null)}
                  onClick={() => { play("tap"); setPending({ index: i, from: pathname }) }}
                  className={cn("relative z-10 flex min-w-0 flex-col items-center justify-center gap-[3px] rounded-full text-[0.6875rem] font-semibold tracking-[-0.005em] transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    selected ? "text-primary" : "text-foreground/70")}>
                  <Icon className="size-[1.375rem]" strokeWidth={selected ? 2.2 : 1.85} />
                  {item.label}
                </Link>
              )
            })}
          </div>
          <button type="button" onClick={expand} aria-label="Show navigation" tabIndex={collapsed ? undefined : -1} aria-hidden={!collapsed}
            className={cn("absolute inset-0 flex items-center justify-center rounded-full text-primary transition-opacity duration-200",
              collapsed ? "opacity-100 delay-100" : "pointer-events-none opacity-0")}>
            <Current className="size-[1.375rem]" strokeWidth={2.2} />
          </button>
        </div>

        <button type="button" onClick={openAddMenu} aria-label="Add money in or out" aria-haspopup="dialog"
          className="glass-float pressable pointer-events-auto flex size-[3.75rem] shrink-0 items-center justify-center rounded-full text-primary">
          <Plus className="size-[1.625rem]" strokeWidth={2.4} />
        </button>
      </div>
    </nav>
  )
}
