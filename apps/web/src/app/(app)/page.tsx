"use client"

import { useState } from "react"
import { Plus, Wallet } from "lucide-react"
import { BambooDecor, environmentStyle } from "@/components/brand/environment"
import { Panda } from "@/components/brand/panda"
import { StatusBarTint } from "@/components/brand/status-bar-tint"
import { AccountDialog } from "@/components/finance/account-dialog"
import { BalanceCard, HomeBand } from "@/components/home/hero"
import { SafeToSpendCard } from "@/components/home/safe-to-spend"
import { AccountsRail, PaymentsDue, RecentActivity } from "@/components/home/sections"
import { MoneyInOut, QuickActions, SpendingRing } from "@/components/home/widgets"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { environmentFor } from "@/lib/catalog"
import { greeting } from "@/lib/format"
import { useDashboard, useMe } from "@/lib/queries"

function HomeSkeleton() {
  const { data: me } = useMe()
  return (
    <div aria-busy="true" aria-label="Loading your home screen">
      <div style={environmentStyle(me?.settings.home_background)} className="-mx-5 h-[20rem] px-5 pt-[calc(env(safe-area-inset-top)+0.625rem)] sm:-mx-6 sm:px-7 lg:mx-0 lg:mt-7 lg:h-[16rem] lg:rounded-[2rem] lg:px-10 lg:pt-8">
        <div className="flex justify-between lg:hidden"><Skeleton className="size-11 rounded-full bg-white/12" /><Skeleton className="h-11 w-32 rounded-full bg-white/12" /></div>
        <Skeleton className="mt-5 h-3 w-40 bg-white/15 lg:mt-0" /><Skeleton className="mt-2 h-7 w-56 bg-white/15" />
        <Skeleton className="mt-6 ml-36 h-24 rounded-[1.25rem] bg-white/15 lg:ml-0 lg:w-96" />
      </div>
      <div className="mt-5 space-y-5 lg:mt-8">
        <div className="flex gap-3.5 overflow-hidden">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="size-16 shrink-0 rounded-[1.125rem]" />)}</div>
        <Skeleton className="h-72 rounded-2xl" />
        <div className="grid grid-cols-[1.12fr_1fr] gap-3"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>
      </div>
    </div>
  )
}

function Welcome() {
  const { data: me } = useMe()
  const { openAddTransaction } = useAppActions()
  const [adding, setAdding] = useState(false)
  const name = me?.display_name?.split(" ")[0]
  return (
    <section style={environmentStyle(me?.settings.home_background)}
      className="relative isolate -mx-5 flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center overflow-hidden px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-28 text-center text-white sm:-mx-6 lg:mx-0 lg:mt-7 lg:min-h-0 lg:rounded-[2rem] lg:py-16">
      <StatusBarTint from={environmentFor(me?.settings.home_background).from} to={environmentFor(me?.settings.home_background).to} />
      <BambooDecor className="absolute -right-8 -bottom-10 -z-10 h-[26rem]" />
      <Panda pose="wave" priority sizes="192px" className="w-44 drop-shadow-[0_18px_28px_rgb(0_0_0/0.28)] sm:w-48" />
      <h1 className="mt-6 text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">{greeting()}{name ? `, ${name}` : ""}</h1>
      <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-white/85">
        Your money story starts here. Add where your money lives and log what you spend. Faldo works out what&apos;s safe to spend.
      </p>
      <div className="mt-7 flex w-full max-w-xs flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
        <Button size="lg" className="bg-white text-[#17462c] hover:bg-white/90" onClick={() => setAdding(true)}><Wallet /> Add an account</Button>
        <Button size="lg" variant="glass" onClick={() => openAddTransaction({ mode: "expense" })}><Plus /> Log an expense</Button>
      </div>
      {adding && <AccountDialog open={adding} onOpenChange={setAdding} />}
    </section>
  )
}

/**
 * Home: Faldo's green band with the greeting and his note, quick actions, the balance and how it moved,
 * what's safe to spend, spending and money in and out, payments due, accounts and recent activity.
 */
export default function HomePage() {
  const { data, isLoading, error, refetch } = useDashboard("this_month")

  if (error) {
    return (
      <div role="alert" className="mt-[calc(env(safe-area-inset-top)+1rem)] flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive lg:mt-8">
        <span className="flex-1">Couldn&apos;t load your home screen. {error.message}</span>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    )
  }
  if (isLoading || !data) return <HomeSkeleton />
  if (!data.has_data && data.accounts.length === 0) return <Welcome />

  return (
    <div className="pb-4">
      <HomeBand data={data} />
      <div className="mt-5 grid grid-cols-1 gap-7 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-x-10 lg:gap-y-8">
        <div className="cascade contents lg:flex lg:flex-col lg:gap-8">
          <QuickActions className="order-1 lg:order-none" />
          <BalanceCard data={data} className="order-2 lg:order-none" />
          <div className="order-4 grid grid-cols-[1.12fr_1fr] gap-3 lg:order-none">
            <SpendingRing data={data} />
            <MoneyInOut />
          </div>
          <div className="order-5 lg:order-none"><PaymentsDue data={data} /></div>
          <div className="order-6 lg:order-none"><AccountsRail data={data} /></div>
        </div>
        <div className="cascade contents lg:flex lg:flex-col lg:gap-8">
          <SafeToSpendCard sts={data.safe_to_spend} className="order-3 lg:order-none" />
          <div className="order-7 lg:order-none"><RecentActivity data={data} /></div>
        </div>
      </div>
    </div>
  )
}
