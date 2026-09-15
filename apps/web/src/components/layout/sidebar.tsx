"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Flame, Plus, Search } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { useAppActions } from "@/components/layout/app-context"
import { NAV_GROUPS, SETTINGS_ITEM, isActive, type NavItem } from "@/components/layout/nav"
import { Notifications } from "@/components/layout/notifications"
import { UserMenu } from "@/components/layout/user-menu"
import { play } from "@/lib/sound"
import { useEngagement } from "@/lib/queries"
import { cn } from "@/lib/utils"

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => play("tap")}
      className={cn("group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        active && "bg-sidebar-accent font-medium text-foreground")}>
      <Icon className={cn("size-[1.05rem] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} strokeWidth={1.85} />
      {item.label}
    </Link>
  )
}

function StreakRow() {
  const { data } = useEngagement()
  if (!data) return null
  return (
    <Link href="/streaks" className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-sidebar-accent">
      <Flame className={cn("size-[1.05rem] shrink-0", data.logged_today ? "fill-warning/20 text-warning" : "text-muted-foreground")} strokeWidth={1.85} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium"><span className="tabular">{data.current_streak}</span>-day streak</span>
        <span className="mt-1.5 flex gap-0.5" aria-hidden>
          {data.week.map((d) => <span key={d.date} className={cn("h-1 flex-1 rounded-full", d.logged ? "bg-primary" : "bg-border")} />)}
        </span>
      </span>
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { openAddTransaction, openSearch } = useAppActions()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[15.5rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center justify-between pr-2.5 pl-4">
        <Link href="/" aria-label="Faldo home" className="rounded-lg"><Logo /></Link>
        <Notifications />
      </div>
      <div className="space-y-2 px-3 pb-4">
        <button type="button" onClick={openSearch}
          className="flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-2.5 text-sm text-muted-foreground transition-colors hover:border-input hover:text-foreground">
          <Search className="size-4" strokeWidth={1.85} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border bg-muted px-1 font-sans text-[0.6875rem] text-muted-foreground">⌘K</kbd>
        </button>
        <button type="button" onClick={() => openAddTransaction({ mode: "expense" })}
          className="pressable flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="size-4" strokeWidth={2.2} /> New transaction
        </button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3 scrollbar-none" aria-label="Main">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.label} className="space-y-px">
            {index > 0 && <p className="px-2.5 pb-1.5 text-xs font-medium text-muted-foreground/80">{group.label}</p>}
            {group.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
          </div>
        ))}
      </nav>
      <div className="space-y-px border-t border-sidebar-border p-3">
        <StreakRow />
        <NavLink item={SETTINGS_ITEM} pathname={pathname} />
        <UserMenu variant="sidebar" />
      </div>
    </aside>
  )
}
