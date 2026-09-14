"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { ArrowLeftRight, Home, LayoutGrid, Plus, Sparkles } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useAppActions } from "@/components/layout/app-context"
import { ALL_NAV, isActive } from "@/components/layout/nav"
import { cn } from "@/lib/utils"

const PRIMARY = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Activity", icon: ArrowLeftRight },
]
const SECONDARY = [{ href: "/assistant", label: "Assistant", icon: Sparkles }]

export function MobileNav() {
  const pathname = usePathname()
  const { openAddTransaction } = useAppActions()
  const [open, setOpen] = useState(false)
  const more = ALL_NAV.filter((i) => ![...PRIMARY, ...SECONDARY].some((p) => p.href === i.href))
  const moreActive = more.some((i) => isActive(pathname, i.href))

  const tab = (item: { href: string; label: string; icon: typeof Home }) => {
    const active = isActive(pathname, item.href)
    const Icon = item.icon
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
        className={cn("flex flex-1 flex-col items-center gap-1 py-2 text-[0.68rem] font-medium", active ? "text-primary" : "text-muted-foreground")}>
        <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
        {item.label}
      </Link>
    )
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur-md pb-safe lg:hidden" aria-label="Main">
        <div className="mx-auto flex max-w-md items-stretch px-2">
          {PRIMARY.map(tab)}
          <div className="flex flex-1 items-center justify-center">
            <button
              onClick={() => openAddTransaction()}
              className="-mt-5 flex size-13 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-(--shadow-float) transition-transform active:scale-95"
              aria-label="Add transaction"
            >
              <Plus className="size-6" />
            </button>
          </div>
          {SECONDARY.map(tab)}
          <button onClick={() => setOpen(true)}
            className={cn("flex flex-1 flex-col items-center gap-1 py-2 text-[0.68rem] font-medium", moreActive ? "text-primary" : "text-muted-foreground")}>
            <LayoutGrid className="size-5" strokeWidth={1.8} />
            More
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
                  className={cn("flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-xs font-medium", active ? "border-primary/30 bg-accent text-primary" : "bg-card")}>
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
