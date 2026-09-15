"use client"

import Link from "next/link"
import { Plus } from "lucide-react"
import { Mascot } from "@/components/brand/mascot"
import {
  BreakdownCard, BudgetsCard, GoalsCard, LastSevenDaysCard, NetWorthCard, NotesCard, PaydayCard, TodayCard, UpcomingCard,
} from "@/components/home/cards"
import { GreetingBand, HomeTopBar } from "@/components/home/greeting"
import { QuickActionsCard } from "@/components/home/quick-actions"
import { useAppActions } from "@/components/layout/app-context"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard, useMe } from "@/lib/queries"

function HomeSkeleton() {
  return (
    <div className="space-y-4 pt-4">
      <Skeleton className="h-10 w-2/3 rounded-xl" />
      <Skeleton className="h-40 rounded-[1.75rem]" />
      <Skeleton className="h-36 rounded-[1.5rem]" />
      <div className="grid grid-cols-2 gap-3"><Skeleton className="h-44 rounded-[1.5rem]" /><Skeleton className="h-44 rounded-[1.5rem]" /></div>
    </div>
  )
}

export default function HomePage() {
  const { data: me } = useMe()
  const { data, isLoading, error } = useDashboard("this_month")
  const { openAddTransaction } = useAppActions()

  return (
    <div className="pb-2">
      <HomeTopBar />
      {error ? (
        <p className="mt-4 rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">Couldn&apos;t load your home screen. {error.message}</p>
      ) : isLoading || !data ? <HomeSkeleton /> : !data.has_data ? (
        <div className="space-y-4">
          <GreetingBand mood="happy" />
          <div className="card-surface flex flex-col items-center gap-4 px-6 py-10 text-center">
            <Mascot className="animate-bob w-24" outfit={me?.settings.mascot_outfit} />
            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold tracking-tight">Let&apos;s log your first peso</h2>
              <p className="mx-auto max-w-sm text-sm text-muted-foreground">Tap the + button whenever you spend or earn. Faldo builds your budgets, streak and insights from there.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => openAddTransaction({ mode: "expense" })} className="pressable flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"><Plus className="size-4" /> Log an expense</button>
              <Link href="/accounts" className="pressable flex h-12 items-center rounded-full border bg-card px-5 text-sm font-bold">Set up wallets</Link>
            </div>
          </div>
          <QuickActionsCard />
        </div>
      ) : (
        <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          <div className="min-w-0 space-y-4 lg:col-span-8">
            <GreetingBand mood={data.safe_to_spend.shortfall_minor > 0 || data.budget.lines.some((l) => l.status === "over") ? "worried" : "happy"} />
            <QuickActionsCard />
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <BreakdownCard data={data} />
              <TodayCard />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
              <LastSevenDaysCard />
              <PaydayCard />
            </div>
            <UpcomingCard items={data.upcoming} />
            <BudgetsCard data={data} />
          </div>
          <div className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:col-span-4">
            <NetWorthCard data={data} />
            <GoalsCard data={data} />
            <NotesCard />
          </div>
        </div>
      )}
    </div>
  )
}
