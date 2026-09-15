"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus } from "lucide-react"
import { useAppActions } from "@/components/layout/app-context"
import { TAB_ITEMS, isActive, type NavItem } from "@/components/layout/nav"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

function Tab({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => play("tap")}
      className={cn("flex min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-1 text-[0.6875rem] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground active:text-foreground")}>
      <Icon className="size-[1.4rem]" strokeWidth={active ? 2.1 : 1.75} />
      {item.label}
    </Link>
  )
}

export function MobileNav() {
  const pathname = usePathname()
  const { openAddTransaction } = useAppActions()
  if (pathname.startsWith("/assistant")) return null
  const [first, second, ...rest] = TAB_ITEMS

  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border/80 pb-safe lg:hidden" aria-label="Main">
      <div className="mx-auto flex h-14 max-w-lg items-stretch px-2">
        <Tab item={first} pathname={pathname} />
        <Tab item={second} pathname={pathname} />
        <div className="flex flex-1 items-center justify-center">
          <button type="button" onClick={() => openAddTransaction({ mode: "expense" })} aria-label="Add transaction"
            className="pressable flex h-10 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground active:bg-primary/90">
            <Plus className="size-5.5" strokeWidth={2.2} />
          </button>
        </div>
        {rest.map((item) => <Tab key={item.href} item={item} pathname={pathname} />)}
      </div>
    </nav>
  )
}
