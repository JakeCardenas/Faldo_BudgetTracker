"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Flame, MessageCircle, Plus } from "lucide-react"
import { Logo } from "@/components/brand/logo"
import { Mascot } from "@/components/brand/mascot"
import { useAppActions } from "@/components/layout/app-context"
import { NAV_GROUPS, SETTINGS_ITEM, isActive, type NavItem } from "@/components/layout/nav"
import { UserMenu } from "@/components/layout/user-menu"
import { useEngagement, useMe } from "@/lib/queries"
import { cn } from "@/lib/utils"

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}
      className={cn("group flex h-10 items-center gap-3 rounded-2xl px-3 text-[0.9rem] font-semibold text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
        active && "bg-primary text-primary-foreground shadow-(--shadow-card) hover:bg-primary hover:text-primary-foreground")}>
      <Icon className={cn("size-[1.1rem] shrink-0", active ? "text-primary-foreground" : "text-muted-foreground/80 group-hover:text-foreground")} strokeWidth={2} />
      {item.label}
    </Link>
  )
}

function StreakCard() {
  const { data } = useEngagement()
  const { data: me } = useMe()
  if (!data) return null
  return (
    <Link href="/streaks" className="pressable relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-card p-3 shadow-(--shadow-card)">
      <Mascot mood={data.logged_today ? "proud" : "sleepy"} outfit={me?.settings.mascot_outfit} coin={false} className="w-11 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-sm font-extrabold"><Flame className="size-4 fill-[#f28b30] text-[#e0772f]" /> {data.current_streak}-day streak</p>
        <div className="mt-1.5 flex gap-1">
          {data.week.map((d) => <span key={d.date} className={cn("h-1.5 flex-1 rounded-full", d.logged ? "bg-primary" : "bg-muted")} />)}
        </div>
        <p className="mt-1 truncate text-[0.7rem] text-muted-foreground">{data.logged_today ? "Logged today. Nice!" : "Log something to keep it going"}</p>
      </div>
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const { openAddTransaction } = useAppActions()
  return (
    <aside className="sticky top-0 hidden h-dvh w-[17rem] shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center px-5">
        <Link href="/" aria-label="Faldo home"><Logo /></Link>
      </div>
      <div className="flex gap-2 px-3 pb-3">
        <button type="button" onClick={() => openAddTransaction({ mode: "expense" })}
          className="pressable flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-(--shadow-card)">
          <Plus className="size-4" strokeWidth={2.6} /> Add
        </button>
        <Link href="/assistant" aria-label="Talk to Faldo"
          className="pressable flex h-11 items-center justify-center gap-2 rounded-full border bg-card px-4 text-sm font-bold text-primary shadow-(--shadow-card)">
          <MessageCircle className="size-4" /> Talk
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2 scrollbar-none" aria-label="Main">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="space-y-0.5">
            <p className="eyebrow px-3 pb-1">{group.label}</p>
            {group.items.map((item) => <NavLink key={item.href} item={item} pathname={pathname} />)}
          </div>
        ))}
      </nav>
      <div className="space-y-2 border-t border-sidebar-border p-3">
        <StreakCard />
        <NavLink item={SETTINGS_ITEM} pathname={pathname} />
        <UserMenu variant="sidebar" />
      </div>
    </aside>
  )
}
