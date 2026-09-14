"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"
import { useAppActions } from "@/components/layout/app-context"
import { NAV_GROUPS, SETTINGS_ITEM, isActive, type NavItem } from "@/components/layout/nav"
import { UserMenu } from "@/components/layout/user-menu"
import { cn } from "@/lib/utils"

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-9 items-center gap-3 rounded-lg px-2.5 text-[0.9rem] text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
      )}
    >
      <Icon className={cn("size-[1.05rem] shrink-0", active ? "text-primary" : "text-muted-foreground/80 group-hover:text-foreground")} strokeWidth={1.9} />
      {item.label}
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { openAddTransaction } = useAppActions()
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="Faldo home"><Logo /></Link>
      </div>
      <div className="px-3 pb-3">
        <Button className="h-10 w-full justify-start gap-2 rounded-xl px-3 shadow-(--shadow-card)" onClick={() => openAddTransaction()}>
          <Plus className="size-4" /> Add transaction
        </Button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2 scrollbar-none" aria-label="Main">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="px-2.5 pb-1 text-[0.7rem] font-medium tracking-wide text-muted-foreground/70 uppercase">{group.label}</p>
            {group.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
          </div>
        ))}
      </nav>
      <div className="space-y-1 border-t border-sidebar-border p-3">
        <NavLink item={SETTINGS_ITEM} pathname={pathname} />
        <UserMenu variant="sidebar" />
      </div>
    </aside>
  )
}
