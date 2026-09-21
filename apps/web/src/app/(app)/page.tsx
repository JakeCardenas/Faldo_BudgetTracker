"use client"

import { useState } from "react"
import { Plus, Wallet } from "lucide-react"
import { Mascot } from "@/components/brand/mascot"
import { AccountDialog } from "@/components/finance/account-dialog"
import { SafeToSpendCard } from "@/components/home/safe-to-spend"
import { AccountsRail, ComingUp, GoalGlance, HomeHeader, InsightNote, RecentActivity, TotalBalance } from "@/components/home/sections"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard, useMe } from "@/lib/queries"

function HomeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-busy="true" aria-label="Loading your home screen">
      <div className="space-y-6">
        <div className="space-y-3 px-1"><Skeleton className="h-4 w-28" /><Skeleton className="h-11 w-52" /><Skeleton className="h-4 w-40" /></div>
        <Skeleton className="h-60 rounded-3xl" />
        <div className="flex gap-3 overflow-hidden"><Skeleton className="h-39 w-62 shrink-0 rounded-2xl" /><Skeleton className="h-39 w-62 shrink-0 rounded-2xl" /></div>
      </div>
      <div className="hidden space-y-6 lg:block"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-64 rounded-2xl" /></div>
    </div>
  )
}

function Welcome() {
  const { data: me } = useMe()
  const { openAddTransaction } = useAppActions()
  const [adding, setAdding] = useState(false)
  return (
    <section className="mx-auto flex max-w-md flex-col items-center px-4 pt-10 pb-6 text-center lg:pt-16">
      <span className="flex size-24 items-end justify-center overflow-hidden rounded-full bg-secondary" aria-hidden>
        <Mascot className="-mb-2 w-20" outfit={me?.settings.mascot_outfit} coin={false} />
      </span>
      <h2 className="mt-6 text-[1.625rem] leading-tight font-semibold tracking-[-0.03em]">Your money story starts here</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted-foreground">
        Add where your money lives and log what you spend. Faldo works out what&apos;s safe to spend from money you already have.
      </p>
      <div className="mt-7 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
        <Button size="lg" onClick={() => setAdding(true)}><Wallet /> Add an account</Button>
        <Button size="lg" variant="secondary" onClick={() => openAddTransaction({ mode: "expense" })}><Plus /> Log an expense</Button>
      </div>
      {adding && <AccountDialog open={adding} onOpenChange={setAdding} />}
    </section>
  )
}

/**
 * Home answers five questions and stops: what you have, what's safe to spend, anything important,
 * what's coming, and what just happened. Everything else lives in Activity, Plans or You.
 */
export default function HomePage() {
  const { data, isLoading, error, refetch } = useDashboard("this_month")

  return (
    <div className="space-y-7 pb-4 lg:space-y-8">
      <HomeHeader />
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">
          <span className="flex-1">Couldn&apos;t load your home screen. {error.message}</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : isLoading || !data ? <HomeSkeleton /> : !data.has_data && data.accounts.length === 0 ? <Welcome /> : (
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-x-10 lg:gap-y-8">
          <div className="contents lg:flex lg:flex-col lg:gap-8">
            <TotalBalance data={data} />
            <SafeToSpendCard sts={data.safe_to_spend} />
            <AccountsRail data={data} />
            <div className="order-last lg:order-none"><RecentActivity data={data} /></div>
          </div>
          <aside className="contents lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-8" aria-label="Heads up">
            <InsightNote data={data} />
            <ComingUp data={data} />
            <div className="order-last lg:order-none"><GoalGlance data={data} /></div>
          </aside>
        </div>
      )}
    </div>
  )
}
