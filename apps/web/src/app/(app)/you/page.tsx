"use client"

import Link from "next/link"
import { LogOut, ShieldCheck } from "lucide-react"
import { LargeTitle } from "@/components/ios/nav-header"
import { ListGroup, ListRow } from "@/components/ios/list"
import { SETTINGS_ITEM, YOU_GROUPS } from "@/components/layout/nav"
import { Avatar, useLogout } from "@/components/layout/user-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccounts, useEngagement, useMe } from "@/lib/queries"

export default function YouPage() {
  const { data: me, isLoading } = useMe()
  const { data: accounts = [] } = useAccounts()
  const { data: engagement } = useEngagement()
  const logout = useLogout()
  const open = accounts.filter((a) => !a.archived).length

  const values: Record<string, string | undefined> = {
    "/accounts": open ? `${open}` : undefined,
    "/streaks": engagement ? `${engagement.current_streak} ${engagement.current_streak === 1 ? "day" : "days"}` : undefined,
  }

  return (
    <div className="space-y-6">
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
            <Link href="/settings" className="mt-1.5 inline-block text-sm font-medium text-primary hover:opacity-80">Edit profile and preferences</Link>
          </div>
        </section>

        <div className="cascade space-y-6">
          {YOU_GROUPS.map((group) => (
            <ListGroup key={group.label} title={group.label}>
              {group.items.map((item) => (
                <ListRow key={item.href} icon={item.icon} title={item.label} subtitle={item.description} href={item.href} value={values[item.href]} />
              ))}
            </ListGroup>
          ))}
          <ListGroup title="Account" footer={
            <span className="flex items-start gap-1.5"><ShieldCheck className="mt-px size-3.5 shrink-0" />
              Faldo never connects to your bank and never asks for card numbers, CVVs, PINs or banking passwords.</span>
          }>
            <ListRow icon={SETTINGS_ITEM.icon} title="Settings" subtitle="Appearance, categories, AI memory, security and your data" href="/settings" />
            <ListRow icon={LogOut} title="Sign out" onClick={logout} destructive chevron={false} />
          </ListGroup>
        </div>
      </div>
    </div>
  )
}
