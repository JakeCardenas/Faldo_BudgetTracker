"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { History, Home, LayoutGrid, PiggyBank, Plus, Wallet } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAppActions } from "@/components/layout/app-context"
import { ALL_NAV, isActive } from "@/components/layout/nav"
import { cn } from "@/lib/utils"

const PRIMARY = [
  { href: "/", label: "Home", icon: Home },
  { href: "/accounts", label: "Wallet", icon: Wallet },
  { href: "/budgets", label: "Plan", icon: PiggyBank },
  { href: "/transactions", label: "History", icon: History },
]

export function MobileNav() {
  const pathname = usePathname()
  const { openAddTransaction } = useAppActions()
  const [open, setOpen] = useState(false)
  const more = ALL_NAV.filter((i) => !PRIMARY.some((p) => p.href === i.href))
  const moreActive = more.some((i) => isActive(pathname, i.href))

  const tab = (item: { href: string; label: string; icon: typeof Home }) => {
    const active = isActive(pathname, item.href)
    const Icon = item.icon
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[0.65rem] font-semibold transition-colors", active ? "bg-secondary text-primary" : "text-muted-foreground")}>
        <Icon className="size-[1.15rem]" strokeWidth={active ? 2.3 : 1.9} />
        {item.label}
      </Link>
    )
  }

  return (
    <>
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-md items-center gap-2.5">
          <div className="pointer-events-auto flex h-16 min-w-0 flex-1 items-stretch gap-0.5 rounded-full border bg-card/95 p-1.5 shadow-(--shadow-float) backdrop-blur-md">
            {PRIMARY.map(tab)}
            <button onClick={() => setOpen(true)}
              className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[0.65rem] font-semibold transition-colors", moreActive ? "bg-secondary text-primary" : "text-muted-foreground")}>
              <LayoutGrid className="size-[1.15rem]" strokeWidth={1.9} />
              More
            </button>
          </div>
          <button
            onClick={() => openAddTransaction()}
            className="pointer-events-auto flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-(--shadow-float) transition-transform active:scale-95"
            aria-label="Add transaction"
          >
            <Plus className="size-7" strokeWidth={2.4} />
          </button>
        </div>
      </nav>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl pb-safe">
          <SheetHeader><SheetTitle>Go to</SheetTitle></SheetHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-6">
            {more.map((item) => {
              const Icon = item.icon
              const active = isActive(pathname, item.href)
              return (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                  className={cn("flex flex-col items-center gap-2 rounded-3xl border p-3 text-center text-xs font-semibold", active ? "border-primary/30 bg-accent text-primary" : "bg-card")}>
                  <Icon className="size-5" strokeWidth={1.8} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
