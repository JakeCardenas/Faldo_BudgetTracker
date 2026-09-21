"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { TAB_ITEMS, activeTabIndex, type NavItem } from "@/components/layout/nav"
import { useMe } from "@/lib/queries"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

/** Slot positions in the five-column bar; the + sits in the middle (slot 2). */
const SLOT = [0, 1, 3, 4]

export function initialsOf(name?: string | null) {
  return (name ?? "?").split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?"
}

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  const { data: me } = useMe()
  const Icon = item.icon
  const isYou = item.href === "/you"
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => play("tap")}
      className={cn("relative z-10 flex h-full min-w-0 flex-col items-center justify-center gap-[3px] rounded-full text-[0.6875rem] font-medium tracking-[-0.005em] transition-colors duration-200",
        active ? "text-primary" : "text-muted-foreground active:text-foreground")}>
      {isYou && me ? (
        <span className={cn("flex size-[1.4rem] items-center justify-center rounded-full text-[0.5625rem] font-semibold transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20 text-foreground/80")}>
          {initialsOf(me.display_name)}
        </span>
      ) : (
        <Icon className="size-[1.4rem]" strokeWidth={active ? 2.15 : 1.8} />
      )}
      {item.label}
    </Link>
  )
}

/**
 * Floating tab bar for phones and tablets: a translucent capsule above the content with a sliding
 * indicator behind the active tab and the + (record money) in the middle.
 */
export function MobileNav() {
  const pathname = usePathname()
  const { openAddMenu } = useAppActions()
  if (pathname.startsWith("/assistant")) return null
  const index = activeTabIndex(pathname)

  return (
    <nav aria-label="Main" className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:hidden">
      <div className="glass-float pointer-events-auto relative mx-auto grid h-[4.125rem] max-w-[26rem] grid-cols-5 items-stretch rounded-full p-1.5">
        <span aria-hidden className={cn("absolute inset-y-1.5 left-1.5 w-[calc((100%-0.75rem)/5)] rounded-full bg-(--tab-indicator) transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          index < 0 && "opacity-0")}
          style={{ transform: `translateX(${(SLOT[Math.max(index, 0)] ?? 0) * 100}%)` }} />
        <Tab item={TAB_ITEMS[0]} active={index === 0} />
        <Tab item={TAB_ITEMS[1]} active={index === 1} />
        <div className="relative z-10 flex items-center justify-center">
          <button type="button" onClick={openAddMenu} aria-label="Add money in or out"
            className="pressable flex size-[3.25rem] items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_10px_22px_-8px_color-mix(in_oklab,var(--primary)_75%,transparent)] hover:bg-primary/92">
            <Plus className="size-6" strokeWidth={2.3} />
          </button>
        </div>
        <Tab item={TAB_ITEMS[2]} active={index === 2} />
        <Tab item={TAB_ITEMS[3]} active={index === 3} />
      </div>
    </nav>
  )
}
