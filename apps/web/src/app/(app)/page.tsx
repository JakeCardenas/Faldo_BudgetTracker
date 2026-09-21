"use client"

import { useState } from "react"
import { Plus, Wallet } from "lucide-react"
import { BambooDecor, environmentStyle } from "@/components/brand/environment"
import { Panda } from "@/components/brand/panda"
import { AccountDialog } from "@/components/finance/account-dialog"
import { BalanceHero } from "@/components/home/hero"
import { SafeToSpendCard } from "@/components/home/safe-to-spend"
import { AccountsRail, ComingUp, FaldoNote, RecentActivity, SpendingSummary } from "@/components/home/sections"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { greeting } from "@/lib/format"
import { useDashboard, useMe } from "@/lib/queries"

function HomeSkeleton() {
  const { data: me } = useMe()
  return (
    <div aria-busy="true" aria-label="Loading your home screen">
      <div style={environmentStyle(me?.settings.home_background)} className="faldo-env -mx-4 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-5 sm:-mx-6 lg:mx-0 lg:mt-7 lg:rounded-[2rem] lg:px-10 lg:pt-9">
        <Skeleton className="h-4 w-32 bg-foreground/[0.06]" /><Skeleton className="mt-2 h-7 w-52 bg-foreground/[0.06]" />
        <Skeleton className="mt-16 h-4 w-24 bg-foreground/[0.06]" /><Skeleton className="mt-2 h-11 w-48 bg-foreground/[0.06]" />
        <Skeleton className="mt-6 h-44 rounded-2xl bg-foreground/[0.04] lg:h-60" /><Skeleton className="mt-3 h-10 rounded-full bg-foreground/[0.04] sm:w-72" />
      </div>
      <div className="mt-4 space-y-4 lg:mt-8">
        <Skeleton className="h-44 rounded-2xl" /><Skeleton className="h-52 rounded-2xl" />
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
      className="faldo-env relative isolate -mx-4 flex min-h-[calc(100dvh-5rem)] flex-col items-center justify-center overflow-hidden px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-28 text-center sm:-mx-6 lg:mx-0 lg:mt-7 lg:min-h-0 lg:rounded-[2rem] lg:py-16">
      <BambooDecor className="absolute -right-8 -bottom-10 -z-10 hidden h-[26rem] sm:block" />
      <Panda pose="wave" priority sizes="192px" className="w-44 sm:w-48" />
      <h1 className="mt-5 text-[1.75rem] leading-tight font-semibold tracking-[-0.03em]">{greeting()}{name ? `, ${name}` : ""}</h1>
      <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-muted-foreground">
        Your money story starts here. Add where your money lives and log what you spend. Faldo works out what&apos;s safe to spend.
      </p>
      <div className="mt-7 flex w-full max-w-xs flex-col gap-2.5 sm:max-w-none sm:flex-row sm:justify-center">
        <Button size="lg" onClick={() => setAdding(true)}><Wallet /> Add an account</Button>
        <Button size="lg" variant="outline" className="bg-card/80" onClick={() => openAddTransaction({ mode: "expense" })}><Plus /> Log an expense</Button>
      </div>
      {adding && <AccountDialog open={adding} onOpenChange={setAdding} />}
    </section>
  )
}

/**
 * Home: what you have and how it moved (the hero, with Faldo), then what's safe to spend,
 * what you spent, your accounts and what's coming. Everything else lives in Activity, Plans or You.
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
      <BalanceHero data={data} />
      <div className="mt-3 grid grid-cols-1 gap-7 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-x-10 lg:gap-y-8">
        <div className="contents lg:flex lg:flex-col lg:gap-8">
          <SafeToSpendCard sts={data.safe_to_spend} className="order-1 lg:order-none" />
          <div className="order-3 lg:order-none"><AccountsRail data={data} /></div>
          <div className="order-6 lg:order-none"><RecentActivity data={data} /></div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-8">
          <SpendingSummary data={data} className="order-2 lg:order-none" />
          <div className="order-4 lg:order-none"><ComingUp data={data} /></div>
          <FaldoNote data={data} className="order-5 lg:hidden" />
        </div>
      </div>
    </div>
  )
}
