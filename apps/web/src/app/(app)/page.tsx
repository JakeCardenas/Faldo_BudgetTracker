"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { Mascot } from "@/components/brand/mascot"
import { ActivityCard, BreakdownCard, BudgetsCard, GoalsCard, NetWorthCard, NotesCard, UpcomingCard } from "@/components/home/cards"
import { CompanionCard, HomeHeader, HomeTopBar } from "@/components/home/greeting"
import { QuickActionsCard } from "@/components/home/quick-actions"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard, useMe } from "@/lib/queries"

function HomeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
      <div className="space-y-4 lg:col-span-8 lg:space-y-5">
        <Skeleton className="h-64 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-5"><Skeleton className="h-52 rounded-xl" /><Skeleton className="h-52 rounded-xl" /></div>
      </div>
      <div className="space-y-4 lg:col-span-4 lg:space-y-5">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-52 rounded-xl" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const { data: me } = useMe()
  const { data, isLoading, error } = useDashboard("this_month")
  const { openAddTransaction } = useAppActions()

  return (
    <div className="space-y-5 pb-2 lg:space-y-6">
      <div>
        <HomeTopBar />
        <HomeHeader />
      </div>
      {error ? (
        <p className="rounded-xl border border-destructive/20 bg-danger-soft px-4 py-3 text-sm text-destructive">Couldn&apos;t load your home screen. {error.message}</p>
      ) : isLoading || !data ? <HomeSkeleton /> : !data.has_data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-5">
          <section className="card-surface flex flex-col items-center gap-5 px-6 py-12 text-center lg:col-span-8">
            <Mascot className="w-20" outfit={me?.settings.mascot_outfit} coin={false} />
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold tracking-[-0.02em]">Log your first peso</h2>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">Add what you spend or earn. Faldo builds your budgets, streak and insights from there.</p>
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
        <div className="stagger grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-12 lg:gap-5">
          <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-5">
            <NetWorthCard data={data} className="order-1 lg:order-none md:col-span-2" />
            <div className="contents lg:grid lg:grid-cols-2 lg:gap-5">
              <ActivityCard className="order-4 lg:order-none" />
              <BreakdownCard data={data} className="order-5 lg:order-none" />
            </div>
            <UpcomingCard items={data.upcoming} className="order-6 lg:order-none md:col-span-2" />
            <BudgetsCard data={data} className="order-7 lg:order-none" />
          </div>
          <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-5">
            <CompanionCard className="order-2 lg:order-none md:col-span-2"
              mood={data.safe_to_spend.shortfall_minor > 0 || data.budget.lines.some((l) => l.status === "over") ? "worried" : "happy"} />
            <QuickActionsCard className="order-3 lg:order-none md:col-span-2" />
            <GoalsCard data={data} className="order-8 lg:order-none" />
            <NotesCard className="order-9 lg:order-none md:col-span-2" />
          </div>
        </div>
      )}
    </div>
  )
}
