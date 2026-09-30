"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, Search } from "lucide-react"
import { Logo } from "@/shared/ui/brand/logo"
import { Button } from "@/shared/ui/button"
import { useAppActions } from "@/shared/lib/app-actions"
import { TAB_ITEMS, YOU_GROUPS, activeTabIndex, isActive, type NavItem } from "@/shared/config/nav"
import { Notifications } from "@/features/notifications"
import { UserMenu } from "./user-menu"
import { play } from "@/shared/lib/sound"
import { cn } from "@/shared/lib/utils"

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => play("tap")}
      className={cn("flex h-10 items-center gap-3 rounded-[0.75rem] px-3 text-[0.9375rem] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "font-medium text-muted-foreground hover:bg-accent hover:text-foreground")}>
      <Icon className="size-[1.125rem] shrink-0" strokeWidth={active ? 2.2 : 1.9} aria-hidden />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

/**
 * Desktop navigation: a white sidebar that stays put. Add and search first, then the same four places as the phone
 * tab bar, then everything else Faldo does (the Profile pages), with notifications and the account menu at the foot.
 */
export function SideNav() {
  const pathname = usePathname()
  const { openAddMenu, openSearch } = useAppActions()
  // Statistics and Insights belong to History's tab on phones; here they have their own row, so only one lights up.
  const inGroup = YOU_GROUPS.some((g) => g.items.some((item) => isActive(pathname, item.href)))
  const index = inGroup ? -1 : activeTabIndex(pathname)

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 pt-6 pb-4 lg:flex">
      <Link href="/" aria-label="Faldo home" className="self-start rounded-full px-2"><Logo /></Link>

      <div className="mt-6 space-y-2">
        <Button onClick={openAddMenu} size="lg" className="w-full"><Plus strokeWidth={2.3} /> Add</Button>
        <button type="button" onClick={openSearch}
          className="flex h-10 w-full items-center gap-2 rounded-[0.75rem] bg-muted px-3 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <Search className="size-4" strokeWidth={2} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded-md bg-card px-1.5 font-sans text-[0.6875rem] text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)]">⌘K</kbd>
        </button>
      </div>

      <nav aria-label="Main" className="mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="space-y-0.5">
          {TAB_ITEMS.map((item, i) => <SideLink key={item.href} item={item} active={i === index} />)}
        </div>
        {YOU_GROUPS.map((group) => (
          <div key={group.label} className="mt-6">
            <p className="label-caps px-3 pb-1.5">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => <SideLink key={item.href} item={item} active={isActive(pathname, item.href)} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 flex items-center gap-1 border-t border-sidebar-border pt-4">
        <UserMenu showName />
        <Notifications />
      </div>
    </aside>
  )
}
