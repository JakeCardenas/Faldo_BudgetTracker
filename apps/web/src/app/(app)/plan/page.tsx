"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, CreditCard, FlaskConical, HandCoins, LineChart, Loader2, Plus, Target } from "lucide-react"
import { CheckResultView, useFaldoCheck } from "@/components/decide/faldo-check"
import { PlannedPurchases } from "@/components/decide/planned"
import { AmountInput } from "@/components/finance/amount-input"
import { Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { DateTile } from "@/components/home/sections"
import { ListRow } from "@/components/ios/list"
import { LargeTitle } from "@/components/ios/nav-header"
import { Section } from "@/components/ios/panel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { formatDate, formatMoney, monthKey, toMinor } from "@/lib/format"
import { GoalIcon } from "@/lib/goal-icons"
import { goalStatusLine } from "@/lib/goals"
import { BUCKET_COLORS } from "@/lib/money-plan"
import { useBudget, useDebts, useForecast, useGoals, useMoneyPlan, useRecurring, useUpcoming } from "@/lib/queries"
import { cn } from "@/lib/utils"

/** The decision tool: type a price, see Safe to Spend now and after. */
function AffordCheck() {
  const [amount, setAmount] = useState("")
  const check = useFaldoCheck()
  const minor = toMinor(amount)
  return (
    <Section title="Can I afford it?">
      <div className="card-surface p-4 sm:p-5">
        <form onSubmit={(e) => { e.preventDefault(); if (minor) check.mutate({ amount_minor: minor }) }} className="flex gap-2">
          <AmountInput value={amount} onValueChange={(v) => { setAmount(v); if (check.data) check.reset() }} placeholder="5,999" aria-label="Purchase amount" className="flex-1" />
          <Button type="submit" className="h-11 px-5" disabled={!minor || check.isPending}>
            {check.isPending && <Loader2 className="animate-spin" />} Check
          </Button>
        </form>
        {!check.data && !check.error && (
          <p className="mt-2.5 text-[0.8125rem] text-muted-foreground">Faldo shows what it does to Safe to Spend, this week, your budgets and your goals.</p>
        )}
        {check.error && <p className="mt-3 text-sm text-destructive">{check.error instanceof ApiError ? check.error.message : "Couldn't check that."}</p>}
        {check.data && (
          <div className="animate-rise mt-4">
            <CheckResultView result={check.data} />
            <Link href={`/assistant?q=${encodeURIComponent(`Can I afford a ${formatMoney(check.data.amount_minor)} purchase?`)}`}
              className="mt-3 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-primary hover:opacity-80">
              Ask Faldo about it <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}
      </div>
    </Section>
  )
}

const SHORT: Record<string, string> = { commitments: "Bills", needs: "Needs", joy: "Joy Money", savings: "Savings", buffer: "Buffer" }

function Left({ minor, what }: { minor: number; what: string }) {
  return minor >= 0
    ? <><span className="tabular font-medium text-foreground">{formatMoney(minor)}</span> {what} left</>
    : <><span className="tabular font-medium text-expense">{formatMoney(-minor)}</span> over on {what}</>
}

function MoneyPlanSummary() {
  const { data: plan, isLoading } = useMoneyPlan()
  const allocation = plan?.allocation
  const income = plan?.income.minor ?? 0
  const buckets = allocation?.buckets.filter((b) => b.amount_minor > 0) ?? []
  const p = plan?.this_period
  return (
    <Section title="Money plan" href="/plan/money" linkLabel={plan?.configured ? "Edit" : "Set up"}>
      {isLoading ? <Skeleton className="h-40 rounded-2xl" /> : plan?.configured && allocation && income > 0 ? (
        <Link href="/plan/money" className="card-surface block p-4 transition-colors hover:bg-accent/30 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[0.8125rem] text-muted-foreground">{plan.period.label}</p>
            <Money minor={income} className="text-[1.0625rem] font-semibold" />
          </div>
          <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {buckets.map((b) => <span key={b.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(b.amount_minor / income) * 100}%`, backgroundColor: BUCKET_COLORS[b.key] }} />)}
            {allocation.unassigned_minor > 0 && <span className="h-full rounded-r-full" style={{ width: `${(allocation.unassigned_minor / income) * 100}%`, backgroundColor: BUCKET_COLORS.unassigned }} />}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5">
            {buckets.map((b) => (
              <div key={b.key} className="flex min-w-0 items-center justify-between gap-2 text-[0.8125rem]">
                <dt className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: BUCKET_COLORS[b.key] }} /><span className="truncate">{SHORT[b.key]}</span></dt>
                <dd className="tabular font-medium">{formatMoney(b.amount_minor, "PHP", { compact: true })}</dd>
              </div>
            ))}
          </dl>
          {p && (
            <p className="mt-4 border-t pt-3 text-[0.8125rem] text-muted-foreground">
              This period: <Left minor={p.joy_left_minor} what="Joy Money" /> and <Left minor={p.needs_left_minor} what="needs" />.
            </p>
          )}
        </Link>
      ) : (
        <Link href="/plan/money" className="card-surface flex items-center gap-4 p-4 transition-colors hover:bg-accent/30 sm:p-5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Target className="size-5" /></span>
          <span className="min-w-0 flex-1 text-[0.875rem] text-muted-foreground">
            <span className="block text-[0.9375rem] font-medium text-foreground">Give each payday a job</span>
            Bills, needs, Joy Money and savings. Start from 60/20/20 or your own split.
          </span>
        </Link>
      )}
    </Section>
  )
}

function UpcomingList() {
  const { data: upcoming = [], isLoading } = useUpcoming(30)
  const rows = [...upcoming].sort((a, b) => a.days_until_due - b.days_until_due).slice(0, 5)
  return (
    <Section title="Coming up" description="Next 30 days" href="/bills" linkLabel="All bills">
      {isLoading ? <Skeleton className="h-48 rounded-2xl" /> : rows.length === 0 ? (
        <Link href="/bills" className="card-surface block px-4 py-5 text-center text-sm text-muted-foreground hover:text-foreground">Add rent, bills, subscriptions and income so Faldo can plan around them.</Link>
      ) : (
        <ul className="ios-group divide-y divide-border/60">
          {rows.map((u) => (
            <li key={`${u.recurring_payment_id}-${u.due_on}`}>
              <Link href="/bills" className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50">
                <DateTile date={u.due_on} tone={u.is_overdue && !u.is_income ? "overdue" : !u.is_income && u.days_until_due <= 3 ? "soon" : "normal"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-medium">{u.name}</span>
                  <span className={cn("block truncate text-[0.8125rem]", u.is_overdue && !u.is_income ? "font-medium text-expense" : "text-muted-foreground")}>
                    {u.is_income ? (u.is_one_time ? "Expected once, not counted yet" : "Expected income, not counted yet") : u.is_overdue ? "Overdue" : u.days_until_due === 0 ? "Due today" : `Due in ${u.days_until_due} ${u.days_until_due === 1 ? "day" : "days"}`}
                  </span>
                </span>
                <Money minor={u.amount_minor} signed={u.is_income} className={cn("text-[0.9375rem] font-semibold", u.is_income && "text-income")} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function GoalsList() {
  const { data: goals = [], isLoading } = useGoals()
  const active = goals.filter((g) => g.status === "active")
  return (
    <Section title="Goals" href="/goals" linkLabel={active.length > 3 ? `All ${active.length}` : "See all"}>
      {isLoading ? <Skeleton className="h-40 rounded-2xl" /> : active.length === 0 ? (
        <Link href="/goals?new=1" className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/15 px-4 py-4 text-[0.875rem] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><Plus className="size-4.5" /></span>
          Start a goal and track every peso toward it.
        </Link>
      ) : (
        <ul className="ios-group divide-y divide-border/60">
          {active.slice(0, 3).map((g) => (
            <li key={g.id}>
              <Link href="/goals" className="block px-4 py-3.5 transition-colors hover:bg-accent/50">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><GoalIcon value={g.emoji} className="size-[1.05rem]" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-medium">{g.name}</span>
                    <span className="tabular block truncate text-[0.8125rem] text-muted-foreground">{formatMoney(g.saved_minor)} of {formatMoney(g.target_minor)}</span>
                  </span>
                  <span className="tabular text-[0.9375rem] font-semibold">{Math.round(g.pct_complete)}%</span>
                </div>
                <ProgressBar className="mt-2.5" value={g.pct_complete} status={g.on_track === false ? "behind" : "on_track"} label={`${g.name} progress`} />
                <p className={cn("mt-1.5 text-xs", g.on_track === false ? "text-warning" : "text-muted-foreground")}>{goalStatusLine(g)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function BudgetsList() {
  const { data: budget, isLoading } = useBudget(monthKey())
  const lines = [...(budget?.lines ?? [])].sort((a, b) => b.pct_used - a.pct_used).slice(0, 3)
  return (
    <Section title="Budgets" href="/budgets" description={budget?.lines.length ? `${formatMoney(budget.total_spent_minor)} of ${formatMoney(budget.total_budgeted_minor)} used this month` : undefined}>
      {isLoading ? <Skeleton className="h-36 rounded-2xl" /> : lines.length === 0 ? (
        <Link href="/budgets" className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/15 px-4 py-4 text-[0.875rem] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><Plus className="size-4.5" /></span>
          Set monthly limits and Faldo warns you early.
        </Link>
      ) : (
        <ul className="card-surface space-y-4 p-4 sm:p-5">
          {lines.map((l) => (
            <li key={l.id}>
              <div className="flex items-baseline justify-between gap-2 text-[0.9375rem]">
                <span className="truncate">{l.category_name}</span>
                <span className={cn("tabular text-[0.8125rem]", l.status === "over" ? "font-medium text-expense" : "text-muted-foreground")}>
                  {l.remaining_minor >= 0 ? `${formatMoney(l.remaining_minor)} left` : `${formatMoney(-l.remaining_minor)} over`}
                </span>
              </div>
              <ProgressBar className="mt-2" value={l.pct_used} status={l.status} label={`${l.category_name} budget used`} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function MoneyOwed() {
  const { data: debts = [] } = useDebts()
  const open = debts.filter((d) => d.status === "open")
  const iOwe = open.filter((d) => d.direction === "i_owe").reduce((s, d) => s + d.outstanding_minor, 0)
  const owedToMe = open.filter((d) => d.direction === "owed_to_me").reduce((s, d) => s + d.outstanding_minor, 0)
  return (
    <Section title="Money owed" href="/debts" linkLabel={open.length ? "See all" : "Add"}>
      {open.length === 0 ? (
        <Link href="/debts?new=1" className="flex items-center gap-3 rounded-2xl border border-dashed border-foreground/15 px-4 py-4 text-[0.875rem] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><HandCoins className="size-4.5" /></span>
          Track utang, loans to friends and split bills.
        </Link>
      ) : (
        <div className="ios-group">
          <div className="grid grid-cols-2 divide-x divide-border/60 border-b border-border/60">
            <div className="px-4 py-3"><p className="text-xs text-muted-foreground">You owe</p><Money minor={iOwe} className="text-[1.0625rem] font-semibold" /></div>
            <div className="px-4 py-3"><p className="text-xs text-muted-foreground">Owed to you</p><Money minor={owedToMe} className="text-[1.0625rem] font-semibold text-income" /></div>
          </div>
          <ul className="divide-y divide-border/60">
            {open.slice(0, 3).map((d) => (
              <li key={d.id}>
                <Link href="/debts" className="flex items-center justify-between gap-3 px-4 py-3 text-[0.9375rem] transition-colors hover:bg-accent/50">
                  <span className="min-w-0">
                    <span className="block truncate">{d.direction === "owed_to_me" ? `${d.counterparty} owes you` : `You owe ${d.counterparty}`}</span>
                    {d.due_on && <span className="block text-xs text-muted-foreground">Due {formatDate(d.due_on, "MMM d")}</span>}
                  </span>
                  <Money minor={d.outstanding_minor} className={cn("font-semibold", d.direction === "owed_to_me" && "text-income")} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}

function MoreAhead() {
  const { data: forecast } = useForecast("end_of_month")
  const { data: recurring = [] } = useRecurring()
  const installments = recurring.filter((r) => r.is_active && r.kind === "loan")
  return (
    <Section title="Look ahead">
      <div className="ios-group divide-y divide-border/60">
        <ListRow icon={LineChart} title="Forecast" href="/forecast"
          subtitle={forecast ? `Estimated ${formatMoney(forecast.end_balance.p50)} on ${formatDate(forecast.horizon_end, "MMM d")}` : "Where your balance is heading"} />
        <ListRow icon={FlaskConical} title="What if" href="/forecast#what-if" subtitle="Try spending or saving more and see the effect" />
        <ListRow icon={CreditCard} title="Installments and loans" href="/bills"
          subtitle={installments.length ? `${installments.length} active, ${formatMoney(installments.reduce((s, r) => s + r.monthly_equivalent_minor, 0))} a month` : "Card installments, BNPL and loans"} />
      </div>
    </Section>
  )
}

/** Future money: what's due, what you're saving for and what you want to buy. */
export default function PlansPage() {
  return (
    <div className="space-y-6">
      <LargeTitle title="Plan" subtitle="What's due, what you're saving for and what you want to buy." />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        <div className="space-y-8">
          <AffordCheck />
          <MoneyPlanSummary />
          <UpcomingList />
          <PlannedPurchases />
        </div>
        <div className="space-y-8">
          <GoalsList />
          <BudgetsList />
          <MoneyOwed />
          <MoreAhead />
        </div>
      </div>
    </div>
  )
}
