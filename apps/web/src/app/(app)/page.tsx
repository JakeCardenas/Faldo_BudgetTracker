"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { Mascot } from "@/components/brand/mascot"
import { AttentionCard } from "@/components/home/attention"
import { GoalsCard, RecentCard, UpcomingCard, YourMoneyCard } from "@/components/home/cards"
import { CompanionCard, HomeHeader, HomeTopBar } from "@/components/home/greeting"
import { QuickActionsCard } from "@/components/home/quick-actions"
import { SafeToSpendHero } from "@/components/home/safe-to-spend"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard, useMe } from "@/lib/queries"

function HomeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5" aria-busy="true" aria-label="Loading your home screen">
      <div className="space-y-4 lg:col-span-8 lg:space-y-5">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
      <div className="space-y-4 lg:col-span-4 lg:space-y-5">
        <Skeleton className="h-52 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const { data: me } = useMe()
  const { data, isLoading, error, refetch } = useDashboard("this_month")
  const { openAddTransaction } = useAppActions()

  return (
    <div className="space-y-5 pb-2 lg:space-y-6">
      <div>
        <HomeTopBar />
        <HomeHeader />
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/20 bg-danger-soft px-4 py-3 text-sm text-destructive">
          <span className="flex-1">Couldn&apos;t load your home screen. {error.message}</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Try again</Button>
        </div>
      ) : isLoading || !data ? <HomeSkeleton /> : !data.has_data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5">
          <section className="card-surface flex flex-col items-center gap-5 px-6 py-12 text-center lg:col-span-8">
            <Mascot className="w-20" outfit={me?.settings.mascot_outfit} coin={false} />
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Log your first peso</h2>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                Add what you spend or earn. Faldo works out what&apos;s safe to spend from the money you already have.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="lg" onClick={() => openAddTransaction({ mode: "expense" })}><Plus /> Log an expense</Button>
              <Button size="lg" variant="outline" asChild><Link href="/accounts">Set up wallets</Link></Button>
            </div>
          </section>
          <div className="space-y-4 lg:col-span-4 lg:space-y-5">
            <CompanionCard mood="happy" />
            <QuickActionsCard />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-5">
            <SafeToSpendHero sts={data.safe_to_spend} className="order-1 md:col-span-2 lg:order-none" />
            <AttentionCard items={data.attention} className="order-2 md:col-span-2 lg:order-none" />
            <UpcomingCard items={data.upcoming} className="order-4 md:col-span-2 lg:order-none" />
            <RecentCard transactions={data.recent_transactions} className="order-6 md:col-span-2 lg:order-none" />
          </div>
          <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-5">
            <YourMoneyCard data={data} className="order-3 lg:order-none" />
            <CompanionCard className="order-5 lg:order-none"
              mood={data.safe_to_spend.status === "short" || data.budget.lines.some((l) => l.status === "over") ? "worried" : "happy"} />
            <GoalsCard data={data} className="order-7 lg:order-none" />
            <QuickActionsCard className="order-8 md:col-span-2 lg:order-none" />
          </div>
        </div>
      )}
    </div>
  )
}
