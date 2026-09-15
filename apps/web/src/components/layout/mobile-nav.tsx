"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { TAB_ITEMS, isActive } from "@/components/layout/nav"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

export function MobileNav() {
  const pathname = usePathname()
  const { openAddTransaction } = useAppActions()
  if (pathname.startsWith("/assistant")) return null

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] lg:hidden" aria-label="Main">
      <div className="mx-auto flex max-w-md items-center gap-2.5">
        <div className="pointer-events-auto flex h-[3.9rem] min-w-0 flex-1 items-stretch gap-0.5 rounded-full border bg-card/90 p-1.5 shadow-(--shadow-float) backdrop-blur-xl backdrop-saturate-150">
          {TAB_ITEMS.map((item) => {
            const active = isActive(pathname, item.href)
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} onClick={() => play("tap")}
                className={cn("pressable flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[0.64rem] font-bold transition-colors",
                  active ? "bg-secondary text-primary" : "text-muted-foreground")}>
                <Icon className="size-[1.2rem]" strokeWidth={active ? 2.4 : 1.9} />
                {item.label}
              </Link>
            )
          })}
        </div>
        <button onClick={() => openAddTransaction({ mode: "expense" })} aria-label="Add transaction"
          className="pressable pointer-events-auto flex size-[3.9rem] shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-(--shadow-float)">
          <Plus className="size-7" strokeWidth={2.4} />
        </button>
      </div>
    </nav>
  )
}
