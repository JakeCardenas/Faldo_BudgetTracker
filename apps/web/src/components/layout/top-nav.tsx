"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { useAppActions } from "@/components/layout/app-context"
import { TAB_ITEMS, activeTabIndex } from "@/components/layout/nav"
import { Notifications } from "@/components/layout/notifications"
import { UserMenu } from "@/components/layout/user-menu"
import { Button } from "@/components/ui/button"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

/** Desktop navigation: one slim translucent bar. The same four places as the phone tab bar. */
export function TopNav() {
  const pathname = usePathname()
  const { openAddMenu, openSearch } = useAppActions()
  const index = activeTabIndex(pathname)

  return (
    <header className="glass sticky top-0 z-40 hidden border-b border-border/60 lg:block">
      <div className="mx-auto grid h-16 max-w-[1240px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-8">
        <Link href="/" aria-label="Faldo home" className="justify-self-start rounded-full"><Logo /></Link>

        <nav aria-label="Main" className="relative grid grid-cols-4 rounded-full bg-muted p-1">
          <span aria-hidden className={cn("absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] rounded-full bg-card shadow-[0_1px_3px_rgb(16_36_24/0.1),0_0_0_0.5px_rgb(16_36_24/0.05)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] dark:bg-[#2b302c]",
            index < 0 && "opacity-0")}
            style={{ transform: `translateX(${Math.max(index, 0) * 100}%)` }} />
          {TAB_ITEMS.map((item, i) => (
            <Link key={item.href} href={item.href} aria-current={i === index ? "page" : undefined} onClick={() => play("tap")}
              className={cn("relative z-10 flex h-9 w-[6.25rem] items-center justify-center rounded-full text-sm font-medium transition-colors",
                i === index ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-1.5">
          <button type="button" onClick={openSearch}
            className="flex h-9 items-center gap-2 rounded-full bg-card pr-2 pl-3 text-sm text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-colors hover:text-foreground">
            <Search className="size-4" strokeWidth={1.9} />
            <span className="pr-4">Search</span>
            <kbd className="rounded-md bg-muted px-1.5 font-sans text-[0.6875rem] text-muted-foreground">⌘K</kbd>
          </button>
          <Notifications />
          <Button onClick={openAddMenu} className="ml-1"><Plus strokeWidth={2.3} /> Add</Button>
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
