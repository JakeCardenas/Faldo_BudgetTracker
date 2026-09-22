"use client"

import { BookOpen, Flame, Lightbulb, Settings, Wrench } from "lucide-react"
import { LargeTitle } from "@/components/ios/nav-header"
import { ListGroup, ListRow } from "@/components/ios/list"
import { Avatar, useLogout } from "@/components/layout/user-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useMe } from "@/lib/queries"

/**
 * Profile's menu, Threads-style: an icon and a word per row. Import, Statistics and Talk to Faldo live
 * on Wallet, History and the Faldo bubble, so they are not repeated here.
 */
const MENU = [
  { href: "/streaks", label: "Streaks and rewards", icon: Flame },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/learn", label: "Learn", icon: BookOpen },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
]

export default function YouPage() {
  const { data: me, isLoading } = useMe()
  const logout = useLogout()

  return (
    <div className="space-y-5">
      <LargeTitle title="Profile" back={{ href: "/", label: "Home" }} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start lg:gap-10">
        <section className="flex items-center gap-4 lg:sticky lg:top-24 lg:flex-col lg:items-start lg:gap-5 lg:rounded-2xl lg:bg-card lg:p-6 lg:shadow-(--shadow-card)">
          <Avatar name={me?.display_name} className="size-16 text-lg lg:size-20 lg:text-2xl" />
          <div className="min-w-0 flex-1">
            {isLoading ? <><Skeleton className="h-5 w-32" /><Skeleton className="mt-2 h-4 w-44" /></> : (
              <>
                <p className="truncate text-xl font-semibold tracking-[-0.02em]">{me?.display_name}</p>
                <p className="truncate text-sm text-muted-foreground">{me?.email}</p>
              </>
            )}
          </div>
        </section>

        <div className="cascade space-y-3">
          <ListGroup>
            {MENU.map((item) => <ListRow key={item.href} icon={item.icon} title={item.label} href={item.href} />)}
          </ListGroup>
          <ListGroup divider>
            <ListRow title="Sign out" onClick={logout} destructive />
          </ListGroup>
        </div>
      </div>
    </div>
  )
}
