"use client"

import Link from "next/link"
import { useState } from "react"
import { Plus, Receipt, Target, Wallet } from "lucide-react"
import { Mascot } from "@/components/brand/mascot"
import { Hero } from "@/components/dashboard/hero"
import { SpendingRing, ThisPeriod, WeekBars } from "@/components/dashboard/month"
import { PaymentsDue } from "@/components/dashboard/payments-due"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { Wallets } from "@/components/dashboard/wallets"
import { useAppActions } from "@/components/layout/app-context"
import { CategoryIcon } from "@/components/finance/category-icon"
import { EmptyState } from "@/components/finance/empty-state"
import { Money } from "@/components/finance/money"
import { ProgressBar, STATUS_LABEL } from "@/components/finance/progress-bar"
import { TransactionRow } from "@/components/finance/transaction-row"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate, formatMoney, formatPct } from "@/lib/format"
import { useDashboard, useMe } from "@/lib/queries"
import type { Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"

const RANGES = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30_days", label: "30 days" },
  { value: "last_90_days", label: "90 days" },
  { value: "this_year", label: "This year" },
]

function CardHeader({ title, subtitle, href, linkLabel }: { title: string; subtitle?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-[0.95rem] font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {href && <Link href={href} className="text-xs font-semibold text-primary hover:underline">{linkLabel}</Link>}
    </div>
  )
}

function Budgets({ data }: { data: Dashboard }) {
  const lines = [...data.budget.lines].sort((a, b) => b.pct_used - a.pct_used).slice(0, 5)
  return (
    <section className="card-surface flex h-full flex-col p-5">
      <CardHeader title="Budgets" href="/budgets" linkLabel="Manage"
        subtitle={lines.length ? `${formatMoney(data.budget.total_spent_minor)} of ${formatMoney(data.budget.total_budgeted_minor)} this month` : "This month"} />
      {lines.length === 0 ? (
        <EmptyState compact icon={Wallet} title="No budgets yet" description="Set monthly limits and Faldo will warn you before you overspend."
          action={<Button asChild size="sm" variant="outline" className="rounded-full"><Link href="/budgets">Create a budget</Link></Button>} />
      ) : (
        <ul className="mt-4 space-y-3.5">
          {lines.map((line) => (
            <li key={line.id} className="flex items-center gap-3">
              <CategoryIcon icon={line.category_icon} color={line.category_color} className="rounded-2xl" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-semibold">{line.category_name}</span>
                  <span className="tabular text-xs text-muted-foreground"><span className="font-semibold text-foreground">{formatMoney(line.spent_minor)}</span> / {formatMoney(line.limit_minor)}</span>
                </div>
                <ProgressBar className="h-2.5" value={line.pct_used} status={line.status} marker={line.pct_month_elapsed} label={`${line.category_name} budget ${line.pct_used}% used`} />
                <div className="flex justify-between text-[0.7rem] text-muted-foreground">
                  <span className={cn("font-medium", line.status === "over" && "text-destructive", line.status === "at_risk" && "text-warning")}>{STATUS_LABEL[line.status]}</span>
                  <span>{line.remaining_minor >= 0 ? `${formatMoney(line.remaining_minor)} left` : `${formatMoney(-line.remaining_minor)} over`}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Recent({ data }: { data: Dashboard }) {
  const { openTransaction, openAddTransaction } = useAppActions()
  return (
    <section className="card-surface flex h-full flex-col p-5">
      <CardHeader title="Recent activity" href="/transactions" linkLabel="View all" />
      {data.recent_transactions.length === 0 ? (
        <EmptyState compact icon={Receipt} title="No transactions yet" description="Your financial story starts here."
          action={<Button size="sm" className="rounded-full" onClick={() => openAddTransaction()}><Plus /> Add your first transaction</Button>} />
      ) : (
        <div className="-mx-2 mt-2 divide-y divide-border/60">
          {data.recent_transactions.map((t) => <TransactionRow key={t.id} transaction={t} showDate onClick={() => openTransaction(t.id)} />)}
        </div>
      )}
    </section>
  )
}

function Goals({ data }: { data: Dashboard }) {
  return (
    <section className="card-surface p-5">
      <CardHeader title="Goals" subtitle="What you're saving for" href="/goals" linkLabel="All goals" />
      {data.goals.length === 0 ? (
        <EmptyState compact icon={Target} title="What are you saving for?" description="A goal turns “someday” into a date."
          action={<Button asChild size="sm" variant="outline" className="rounded-full"><Link href="/goals">Create a goal</Link></Button>} />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.goals.map((goal) => (
            <Link key={goal.id} href="/goals" className="group rounded-3xl border bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-secondary/50">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-card text-xl shadow-(--shadow-card)" aria-hidden>{goal.emoji ?? "🎯"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{goal.name}</p>
                  <p className={cn("text-[0.7rem] text-muted-foreground", goal.on_track === false && "text-warning")}>
                    {goal.projected_completion_on ? `Est. ${formatDate(goal.projected_completion_on, "MMM yyyy")}` : "No projection yet"}
                    {goal.on_track === false && " · behind"}
                  </p>
                </div>
                <span className="tabular text-sm font-extrabold text-primary">{formatPct(goal.pct_complete)}</span>
              </div>
              <ProgressBar className="mt-3 h-2.5" value={goal.pct_complete} status={goal.on_track === false ? "behind" : "on_track"} label={`${goal.name} ${goal.pct_complete}% complete`} />
              <p className="mt-2 text-xs"><Money minor={goal.saved_minor} className="font-bold" /> <span className="text-muted-foreground">of {formatMoney(goal.target_minor)}</span></p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-72 rounded-[1.75rem]" />
      <Skeleton className="h-32 rounded-3xl" />
      <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-3xl" />)}</div>
    </div>
  )
}

export default function HomePage() {
  const [range, setRange] = useState("this_month")
  const { data: me } = useMe()
  const { data, isLoading, error } = useDashboard(range)
  const { openAddTransaction } = useAppActions()

  if (error) return <p className="rounded-2xl bg-danger-soft px-4 py-3 text-sm text-destructive">Couldn't load your dashboard. {error.message}</p>
  if (isLoading || !data) return <DashboardSkeleton />

  if (!data.has_data) {
    return (
      <div className="card-surface flex flex-col items-center gap-4 px-6 py-12 text-center">
        <Mascot className="animate-bob w-28" />
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold tracking-tight">Hi {me?.display_name ?? "there"}! Let&apos;s get your money in one place.</h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">Add your first transaction and Faldo will start building your spending picture, budgets and insights.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button size="lg" className="rounded-full px-5" onClick={() => openAddTransaction()}><Plus /> Add your first transaction</Button>
          <Button size="lg" variant="outline" className="rounded-full px-5" asChild><Link href="/accounts">Set up accounts</Link></Button>
        </div>
      </div>
    )
  }

  return (
    <div className="stagger min-w-0 space-y-4 pt-1">
      <Hero data={data} name={me?.display_name ?? ""} />
      <QuickActions />

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="px-1 text-lg font-extrabold tracking-tight">Your money, {RANGES.find((r) => r.value === range)?.label.toLowerCase()}</h2>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 scrollbar-none" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button key={r.value} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)}
              className={cn("h-8 shrink-0 rounded-full px-3.5 text-xs font-semibold transition-colors",
                range === r.value ? "bg-foreground text-background" : "bg-card text-foreground shadow-(--shadow-card) hover:bg-muted")}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SpendingRing data={data} />
        <ThisPeriod data={data} />
        <div className="min-w-0 md:col-span-2 xl:col-span-1"><WeekBars /></div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7"><Wallets accounts={data.accounts} /></div>
        <div className="min-w-0 lg:col-span-5"><PaymentsDue items={data.upcoming} /></div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7"><Recent data={data} /></div>
        <div className="min-w-0 lg:col-span-5"><Budgets data={data} /></div>
      </div>

      <Goals data={data} />
    </div>
  )
}
