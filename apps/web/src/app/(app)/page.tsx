"use client"

import { useState } from "react"
import { Plus, Wallet } from "lucide-react"
import { Panda } from "@/shared/ui/brand/panda"
import { AccountDialog } from "@/features/account-edit"
import { BalanceCard, BalanceRow, FaldoPanel, HomeHeader, SafeToSpendCard, AccountsRail, PaymentsDue, RecentActivity, MoneyInOut, QuickActions, SpendingCard } from "@/widgets/home-dashboard"
import { useAppActions } from "@/shared/lib/app-actions"
import { Button } from "@/shared/ui/button"
import { Skeleton } from "@/shared/ui/skeleton"
import { formatDate, greeting } from "@/shared/lib/format"
import { useMaskedAmounts } from "@/shared/lib/privacy"
import { useDashboard } from "@/entities/dashboard"
import { useMe } from "@/entities/session"

function HomeSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your home screen" className="pt-[calc(var(--top-inset)+0.75rem)] lg:pt-10">
      <div className="flex justify-between lg:hidden"><Skeleton className="size-11 rounded-full" /><Skeleton className="h-11 w-40 rounded-full" /></div>
      <Skeleton className="mt-5 h-3 w-36 lg:mt-0" /><Skeleton className="mt-2 h-7 w-56" />
      <div className="mt-4 grid grid-cols-1 gap-6 lg:mt-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
        <div className="space-y-6">
          <Skeleton className="h-36 rounded-[1.5rem]" />
          <Skeleton className="h-32 rounded-[1.375rem]" />
          <div className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2"><Skeleton className="h-48 rounded-[1.375rem]" /><Skeleton className="h-48 rounded-[1.375rem]" /></div>
          <Skeleton className="h-60 rounded-[1.375rem]" />
        </div>
        <div className="hidden space-y-6 xl:block"><Skeleton className="h-80 rounded-[1.375rem]" /><Skeleton className="h-72 rounded-[1.375rem]" /></div>
      </div>
    </div>
  )
}

/** A first visit with nothing recorded: Faldo waves from his strip and offers the two first steps. */
function Welcome() {
  const { data: me } = useMe()
  const { openAddTransaction } = useAppActions()
  const [adding, setAdding] = useState(false)
  const name = me?.display_name?.split(" ")[0]
  return (
    <section className="pt-[calc(var(--top-inset)+1.5rem)] lg:pt-12">
      <p className="label-caps">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
      <h1 className="mt-1 text-[1.75rem] leading-tight tracking-[-0.03em] lg:text-[2rem]">{greeting()}{name ? <>, <span className="font-extrabold">{name}</span>!</> : ""}</h1>
      <div className="relative -mx-5 mt-6 overflow-hidden sm:-mx-6 lg:mx-0 lg:rounded-[1.75rem]">
        <div aria-hidden className="absolute inset-x-0 top-24 bottom-0 bg-hero" />
        <div className="relative flex flex-col items-center px-5 pb-8 text-center sm:px-6">
          <Panda pose="wave" priority sizes="176px" className="w-40 drop-shadow-[0_14px_22px_rgb(0_0_0/0.22)] sm:w-44" />
          <div className="card-surface mt-3 w-full max-w-md p-5 text-left sm:p-6">
            <p className="text-[1.0625rem] font-bold tracking-[-0.015em]">Your money story starts here</p>
            <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-muted-foreground">
              Add where your money lives and log what you spend. Faldo works out what&apos;s safe to spend.
            </p>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <Button size="lg" className="flex-1" onClick={() => setAdding(true)}><Wallet /> Add an account</Button>
              <Button size="lg" variant="secondary" className="flex-1" onClick={() => openAddTransaction({ mode: "expense" })}><Plus /> Log an expense</Button>
            </div>
          </div>
        </div>
      </div>
      {adding && <AccountDialog open={adding} onOpenChange={setAdding} />}
    </section>
  )
}

/**
 * Home, in Tarsi's order: the greeting, Faldo's note on his green strip, quick actions, Safe to Spend beside money in
 * and out, the total balance, what's due and the latest activity. On wide screens the balance line and spending sit
 * in a side column; accounts close the page. The same order on every width, so nothing jumps between breakpoints.
 */
export default function HomePage() {
  useMaskedAmounts()
  const { data, isLoading, error, refetch } = useDashboard("this_month")

  if (error) {
    return (
      <div role="alert" className="mt-[calc(var(--top-inset)+1rem)] flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive lg:mt-8">
        <span className="flex-1">Couldn&apos;t load your home screen. {error.message}</span>
        <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
      </div>
    )
  }
  if (isLoading || !data) return <HomeSkeleton />
  if (!data.has_data && data.accounts.length === 0) return <Welcome />

  return (
    <div className="pb-4">
      <HomeHeader />
      <div className="mt-1 grid grid-cols-1 gap-6 lg:mt-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-8">
        <div className="cascade flex min-w-0 flex-col gap-6">
          <FaldoPanel data={data} />
          <QuickActions />
          <div className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2">
            <SafeToSpendCard sts={data.safe_to_spend} />
            <MoneyInOut />
          </div>
          <BalanceRow data={data} className="xl:hidden" />
          <PaymentsDue data={data} />
          <RecentActivity data={data} />
        </div>
        <div className="cascade flex min-w-0 flex-col gap-6">
          <BalanceCard data={data} />
          <SpendingCard data={data} />
        </div>
      </div>
      <div className="mt-6 lg:mt-8"><AccountsRail data={data} /></div>
    </div>
  )
}
