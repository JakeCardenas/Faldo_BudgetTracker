"use client"

import Link from "next/link"
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarClock, PiggyBank, Plus, Receipt, Sparkles, Target, Wallet } from "lucide-react"
import { SpendingDonut } from "@/components/charts/charts"
import { useAppActions } from "@/components/layout/app-context"
import { SectionCard } from "@/components/layout/page-header"
import { CategoryIcon } from "@/components/finance/category-icon"
import { EmptyState } from "@/components/finance/empty-state"
import { AnimatedMoney, Money } from "@/components/finance/money"
import { ProgressBar, STATUS_LABEL } from "@/components/finance/progress-bar"
import { Delta } from "@/components/finance/stat"
import { TransactionRow } from "@/components/finance/transaction-row"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatDate, formatMoney, formatPct, greeting, relativeDays } from "@/lib/format"
import { useDashboard, useMe, usePulse } from "@/lib/queries"
import type { Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useState } from "react"

const RANGES = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_year", label: "This year" },
]

function PulseCard() {
  const { data, isLoading } = usePulse()
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-mint/70 via-card to-card p-5 shadow-(--shadow-card)">
      <div className="flex items-start gap-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-medium tracking-wide text-primary uppercase">Financial pulse</p>
          {isLoading || !data ? (
            <div className="space-y-2 pt-1"><Skeleton className="h-4 w-full max-w-lg" /><Skeleton className="h-4 w-2/3" /></div>
          ) : (
            <p className="text-[0.975rem] leading-relaxed text-foreground text-balance-safe">{data.text}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            <span>Generated from your transactions, budgets and goals</span>
            <Link href="/assistant?q=Where%20did%20my%20money%20go%20this%20month%3F" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Ask a follow-up <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function Overview({ data }: { data: Dashboard }) {
  const o = data.overview
  const sts = data.safe_to_spend
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
      <div className="card-surface relative col-span-2 flex flex-col justify-between gap-4 overflow-hidden p-5 xl:col-span-1">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Total balance</span>
          <Tooltip>
            <TooltipTrigger className="text-xs underline decoration-dotted underline-offset-4">All accounts</TooltipTrigger>
            <TooltipContent>Sum of every account, minus credit card balances owed.</TooltipContent>
          </Tooltip>
        </div>
        <AnimatedMoney minor={o.total_balance_minor} className="text-4xl font-semibold tracking-tight sm:text-[2.6rem]" />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <span className="text-muted-foreground">Safe to spend this month</span>
          <span className="font-medium"><Money minor={sts.amount_minor} /> <span className="text-xs text-muted-foreground">· ≈{formatMoney(sts.per_day_minor)}/day</span></span>
        </div>
      </div>
      <div className="card-surface flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Income</span><span className="flex size-7 items-center justify-center rounded-lg bg-mint text-mint-foreground"><ArrowDownLeft className="size-4" /></span>
        </div>
        <Money minor={o.income_minor} className="text-xl font-semibold tracking-tight sm:text-2xl" />
        <Delta pct={o.income_change_pct} goodWhen="up" />
      </div>
      <div className="card-surface flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Expenses</span><span className="flex size-7 items-center justify-center rounded-lg bg-muted text-foreground"><ArrowUpRight className="size-4" /></span>
        </div>
        <Money minor={o.expense_minor} className="text-xl font-semibold tracking-tight sm:text-2xl" />
        <Delta pct={o.expense_change_pct} goodWhen="down" />
      </div>
      <div className="card-surface col-span-2 flex flex-col gap-3 p-5 xl:col-span-1">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>Saved</span><span className="flex size-7 items-center justify-center rounded-lg bg-secondary text-primary"><PiggyBank className="size-4" /></span>
        </div>
        <Money minor={o.saved_minor} className={cn("text-xl font-semibold tracking-tight sm:text-2xl", o.saved_minor < 0 && "text-destructive")} />
        <span className="text-xs text-muted-foreground">
          {o.savings_rate !== null ? `${formatPct(o.savings_rate)} of income` : "Income minus expenses"}
        </span>
      </div>
    </div>
  )
}

function SpendingOverview({ data }: { data: Dashboard }) {
  const rows = data.spending_by_category
  return (
    <SectionCard title="Spending overview" description={data.period.label} className="lg:col-span-7"
      action={<Link href="/reports" className="text-xs font-medium text-primary hover:underline">Reports</Link>}>
      {rows.length === 0 ? (
        <EmptyState compact icon={Wallet} title="No spending in this period" description="Expenses you add will be grouped by category here." />
      ) : (
        <div className="grid items-center gap-6 sm:grid-cols-[13rem_1fr]">
          <SpendingDonut rows={rows} total={data.overview.expense_minor} />
          <ul className="space-y-2.5">
            {rows.slice(0, 6).map((row) => (
              <li key={row.label} className="flex items-center gap-3">
                <CategoryIcon icon={row.icon} color={row.color} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{row.label}</span>
                    <Money minor={row.amount_minor} className="font-medium" />
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                    </div>
                    <span className="tabular w-10 text-right text-xs text-muted-foreground">{formatPct(row.pct)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  )
}

function BudgetHealth({ data }: { data: Dashboard }) {
  const lines = [...data.budget.lines].sort((a, b) => b.pct_used - a.pct_used).slice(0, 5)
  return (
    <SectionCard title="Budget health" description={lines.length ? `${formatMoney(data.budget.total_spent_minor)} of ${formatMoney(data.budget.total_budgeted_minor)} this month` : "This month"}
      className="lg:col-span-5" action={<Link href="/budgets" className="text-xs font-medium text-primary hover:underline">Manage</Link>}>
      {lines.length === 0 ? (
        <EmptyState compact icon={PiggyBank} title="No budgets yet" description="Set monthly limits and Faldo will warn you before you overspend."
          action={<Button asChild size="sm" variant="outline"><Link href="/budgets">Create a budget</Link></Button>} />
      ) : (
        <ul className="space-y-4">
          {lines.map((line) => (
            <li key={line.id} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{line.category_name}</span>
                <span className="tabular text-muted-foreground"><span className="text-foreground">{formatMoney(line.spent_minor)}</span> / {formatMoney(line.limit_minor)}</span>
              </div>
              <ProgressBar value={line.pct_used} status={line.status} marker={line.pct_month_elapsed} label={`${line.category_name} budget ${line.pct_used}% used`} />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className={cn(line.status === "over" && "text-destructive", line.status === "at_risk" && "text-warning")}>{STATUS_LABEL[line.status]}</span>
                <span>{line.remaining_minor >= 0 ? `${formatMoney(line.remaining_minor)} left` : `${formatMoney(-line.remaining_minor)} over`}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function RecentTransactions({ data }: { data: Dashboard }) {
  const { openTransaction, openAddTransaction } = useAppActions()
  return (
    <SectionCard title="Recent transactions" className="lg:col-span-7" bodyClassName="px-3 pb-3 pt-2"
      action={<Link href="/transactions" className="text-xs font-medium text-primary hover:underline">View all</Link>}>
      {data.recent_transactions.length === 0 ? (
        <EmptyState compact icon={Receipt} title="No transactions yet" description="Your financial story starts here."
          action={<Button size="sm" onClick={() => openAddTransaction()}><Plus /> Add your first transaction</Button>} />
      ) : (
        <div className="divide-y divide-border/60">
          {data.recent_transactions.map((t) => <TransactionRow key={t.id} transaction={t} showDate onClick={() => openTransaction(t.id)} />)}
        </div>
      )}
    </SectionCard>
  )
}

function Upcoming({ data }: { data: Dashboard }) {
  const items = data.upcoming.slice(0, 6)
  return (
    <SectionCard title="Upcoming" description="Next 3 weeks" className="lg:col-span-5"
      action={<Link href="/bills" className="text-xs font-medium text-primary hover:underline">Bills</Link>}>
      {items.length === 0 ? (
        <EmptyState compact icon={CalendarClock} title="Nothing scheduled" description="Add rent, utilities and subscriptions so Faldo can plan around them." />
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={`${item.recurring_payment_id}-${item.due_on}`} className="flex items-center gap-3 rounded-xl py-2">
              <div className={cn("flex w-11 shrink-0 flex-col items-center rounded-lg border py-1 text-center", item.is_overdue && "border-destructive/30 bg-danger-soft")}>
                <span className="text-[0.6rem] font-medium text-muted-foreground uppercase">{formatDate(item.due_on, "MMM")}</span>
                <span className="text-sm leading-none font-semibold">{formatDate(item.due_on, "d")}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.name}</p>
                <p className={cn("text-xs text-muted-foreground", item.is_overdue && "text-destructive")}>{relativeDays(item.days_until_due)} · {item.kind}</p>
              </div>
              <Money minor={item.is_income ? item.amount_minor : -item.amount_minor} signed={item.is_income} className={cn("text-sm font-medium", item.is_income && "text-emerald")} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}

function Goals({ data }: { data: Dashboard }) {
  return (
    <SectionCard title="Financial goals" action={<Link href="/goals" className="text-xs font-medium text-primary hover:underline">All goals</Link>}>
      {data.goals.length === 0 ? (
        <EmptyState compact icon={Target} title="What are you saving for?" description="A goal turns “someday” into a date."
          action={<Button asChild size="sm" variant="outline"><Link href="/goals">Create a goal</Link></Button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.goals.map((goal) => (
            <Link key={goal.id} href="/goals" className="group rounded-xl border bg-surface p-4 transition-colors hover:border-primary/25 hover:bg-accent/40">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 truncate text-sm font-medium"><span aria-hidden>{goal.emoji ?? "🎯"}</span>{goal.name}</span>
                <span className="tabular text-xs text-muted-foreground">{formatPct(goal.pct_complete)}</span>
              </div>
              <p className="mt-2 text-sm"><Money minor={goal.saved_minor} className="font-semibold" /> <span className="text-muted-foreground">of {formatMoney(goal.target_minor)}</span></p>
              <ProgressBar className="mt-2.5" value={goal.pct_complete} status={goal.on_track === false ? "behind" : "on_track"} label={`${goal.name} ${goal.pct_complete}% complete`} />
              <p className={cn("mt-2 text-xs text-muted-foreground", goal.on_track === false && "text-warning")}>
                {goal.projected_completion_on ? `Est. ${formatDate(goal.projected_completion_on, "MMM yyyy")}` : "Add contributions to see a projection"}
                {goal.on_track === false && " · behind"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      <div className="grid gap-4 lg:grid-cols-12"><Skeleton className="h-80 rounded-2xl lg:col-span-7" /><Skeleton className="h-80 rounded-2xl lg:col-span-5" /></div>
    </div>
  )
}

export default function HomePage() {
  const [range, setRange] = useState("this_month")
  const { data: me } = useMe()
  const { data, isLoading, error } = useDashboard(range)
  const { openAddTransaction } = useAppActions()

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{formatDate(new Date().toISOString(), "EEEE, MMMM d")}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()}, {me?.display_name ?? ""}.</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-40 bg-card" aria-label="Time range"><SelectValue /></SelectTrigger>
            <SelectContent>{RANGES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button className="hidden sm:inline-flex" onClick={() => openAddTransaction()}><Plus /> Add transaction</Button>
        </div>
      </div>

      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-destructive">Couldn't load your dashboard. {error.message}</p>}
      {isLoading || !data ? <DashboardSkeleton /> : !data.has_data ? (
        <div className="card-surface">
          <EmptyState icon={Wallet} title="Your financial story starts here." description="Add your first transaction and Faldo will start building your spending picture, budgets and insights."
            action={<div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => openAddTransaction()}><Plus /> Add your first transaction</Button>
              <Button variant="outline" asChild><Link href="/accounts">Set up accounts</Link></Button>
            </div>} />
        </div>
      ) : (
        <div className="stagger space-y-4">
          <PulseCard />
          <Overview data={data} />
          <div className="grid gap-4 lg:grid-cols-12">
            <SpendingOverview data={data} />
            <BudgetHealth data={data} />
          </div>
          <div className="grid gap-4 lg:grid-cols-12">
            <RecentTransactions data={data} />
            <Upcoming data={data} />
          </div>
          <Goals data={data} />
        </div>
      )}
    </div>
  )
}
