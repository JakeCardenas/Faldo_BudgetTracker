"use client"

import Link from "next/link"
import { useState } from "react"
import { differenceInCalendarMonths, parseISO } from "date-fns"
import { ArrowRight, ChevronRight, LineChart, Loader2, PieChart } from "lucide-react"
import { CheckResultView, useFaldoCheck } from "@/components/decide/faldo-check"
import { PlannedPurchases } from "@/components/decide/planned"
import { LargeTitle } from "@/components/ios/nav-header"
import { AmountInput } from "@/components/finance/amount-input"
import { ProgressBar } from "@/components/finance/progress-bar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ApiError } from "@/lib/api"
import { FREQUENCY_LABELS, formatDate, formatMoney, formatPct, monthKey, toMinor } from "@/lib/format"
import { GoalIcon } from "@/lib/goal-icons"
import { useBudget, useDebts, useForecast, useGoals, useMoneyPlan, useRecurring } from "@/lib/queries"
import { cn } from "@/lib/utils"

function PlanCard({ href, title, subtitle, children, id }: {
  href: string
  title: string
  subtitle: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className="card-surface min-w-0 scroll-mt-24">
      <Link href={href} className="group flex items-center gap-3 px-4 pt-4 pb-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="section-title">{title}</h2>
          <p className="truncate text-[0.8125rem] text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </section>
  )
}

function Figure({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular mt-0.5 truncate text-base font-semibold tracking-[-0.01em]">{value}</p>
    </div>
  )
}

function PlanCheck() {
  const [amount, setAmount] = useState("")
  const check = useFaldoCheck()
  const minor = toMinor(amount)
  return (
    <section className="card-surface p-4 sm:p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,22rem)] md:items-center">
        <div>
          <h2 className="section-title">Faldo Check</h2>
          <p className="text-[0.8125rem] text-muted-foreground">Before you buy, see what it does to your Safe to Spend, this week and your goals.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (minor) check.mutate({ amount_minor: minor }) }} className="flex gap-2">
          <AmountInput value={amount} onValueChange={(v) => { setAmount(v); if (check.data) check.reset() }} placeholder="5,999" aria-label="Purchase amount" className="flex-1" />
          <Button type="submit" className="h-10" disabled={!minor || check.isPending}>
            {check.isPending && <Loader2 className="animate-spin" />} Check
          </Button>
        </form>
      </div>
      {check.error && <p className="mt-3 text-sm text-destructive">{check.error instanceof ApiError ? check.error.message : "Couldn't check that."}</p>}
      {check.data && (
        <div className="animate-rise mt-4 border-t pt-4">
          <CheckResultView result={check.data} />
          <Link href={`/assistant?q=${encodeURIComponent(`Can I afford a ${formatMoney(check.data.amount_minor)} purchase?`)}`} className="mt-3 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-primary hover:opacity-80">
            Ask Faldo about it <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </section>
  )
}

function MoneyPlanCard() {
  const { data: plan, isLoading } = useMoneyPlan()
  const p = plan?.this_period
  return (
    <Link href="/plan/money" className="card-surface group flex items-center gap-4 p-4 transition-colors hover:border-input sm:p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70"><PieChart className="size-5" strokeWidth={1.75} /></span>
      <div className="min-w-0 flex-1">
        <p className="section-title">Money plan</p>
        {isLoading ? <Skeleton className="mt-1 h-4 w-2/3" /> : plan?.configured && p ? (
          <p className="text-[0.8125rem] text-muted-foreground">
            Joy Money <span className="tabular font-medium text-foreground">{formatMoney(p.joy_left_minor)}</span> left this pay period,
            needs <span className="tabular font-medium text-foreground">{formatMoney(p.needs_left_minor)}</span> left.
          </p>
        ) : (
          <p className="text-[0.8125rem] text-muted-foreground">Give each payday a job: bills, needs, Joy Money, savings. Start from 60/20/20 or your own split.</p>
        )}
      </div>
      <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function RowEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-3 py-5 text-center text-[0.8125rem] text-muted-foreground">{children}</p>
}

export default function PlanPage() {
  const { data: budget, isLoading: budgetLoading } = useBudget(monthKey())
  const { data: goals = [] } = useGoals()
  const { data: recurring = [] } = useRecurring()
  const { data: debts = [] } = useDebts()
  const { data: forecast } = useForecast("end_of_month")

  const active = recurring.filter((r) => r.is_active)
  const bills = active.filter((r) => r.kind !== "income" && r.kind !== "loan")
  const installments = active.filter((r) => r.kind === "loan")
  const income = active.filter((r) => r.kind === "income")
  const billsMonthly = bills.reduce((s, r) => s + r.monthly_equivalent_minor, 0)
  const openDebts = debts.filter((d) => d.status === "open")
  const iOwe = openDebts.filter((d) => d.direction === "i_owe").reduce((s, d) => s + d.outstanding_minor, 0)
  const owedToMe = openDebts.filter((d) => d.direction === "owed_to_me").reduce((s, d) => s + d.outstanding_minor, 0)
  const activeGoals = goals.filter((g) => g.status === "active")
  const saved = goals.reduce((s, g) => s + g.saved_minor, 0)
  const targeted = activeGoals.reduce((s, g) => s + g.target_minor, 0)
  const budgetPct = budget && budget.total_budgeted_minor > 0 ? (budget.total_spent_minor / budget.total_budgeted_minor) * 100 : 0

  return (
    <div className="space-y-5">
      <LargeTitle title="Plan" subtitle="Check purchases, and see budgets, goals, bills and money owed in one place" />
      <PlanCheck />
      <MoneyPlanCard />
      <PlannedPurchases />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 lg:gap-5">
        <PlanCard href="/budgets" title="Budgets" subtitle="Monthly limits by category">
          {budgetLoading ? <Skeleton className="h-28" /> : !budget?.lines.length ? (
            <RowEmpty>Set limits and Faldo warns you early.</RowEmpty>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <p className="tabular text-xl font-semibold tracking-[-0.02em]">{Math.round(budgetPct)}% <span className="text-sm font-normal text-muted-foreground">used</span></p>
                <p className="tabular text-[0.8125rem] text-muted-foreground">{formatMoney(budget.total_spent_minor)} of {formatMoney(budget.total_budgeted_minor)}</p>
              </div>
              <ProgressBar className="mt-2" value={budgetPct} status={budgetPct > 100 ? "over" : "on_track"} label="Overall budget used" />
              <ul className="mt-4 space-y-3 border-t pt-3">
                {[...budget.lines].sort((a, b) => b.pct_used - a.pct_used).slice(0, 3).map((l) => (
                  <li key={l.id}>
                    <div className="flex justify-between gap-2 text-[0.8125rem]"><span className="truncate">{l.category_name}</span><span className="tabular text-muted-foreground">{formatPct(l.pct_used)}</span></div>
                    <ProgressBar className="mt-1.5 h-1" value={l.pct_used} status={l.status} label={`${l.category_name} budget used`} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </PlanCard>

        <PlanCard href="/goals" title="Goals" subtitle="Save for what matters">
          <div className="grid grid-cols-3 divide-x rounded-lg bg-muted/50 py-2.5 [&>div]:px-3">
            <Figure label="Saved" value={formatMoney(saved, "PHP", { compact: true })} />
            <Figure label="Active" value={activeGoals.length} />
            <Figure label="Target" value={formatMoney(targeted, "PHP", { compact: true })} />
          </div>
          <ul className="mt-3 space-y-0.5">
            {activeGoals.slice(0, 3).map((g) => (
              <li key={g.id} className="flex items-center gap-3 py-1.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-foreground/70"><GoalIcon value={g.emoji} className="size-3.5" /></span>
                <span className="min-w-0 flex-1 truncate text-sm">{g.name}</span>
                <span className="tabular text-[0.8125rem] text-muted-foreground">{formatPct(g.pct_complete)}</span>
              </li>
            ))}
            {activeGoals.length === 0 && <li><RowEmpty>Start a goal and track every peso toward it.</RowEmpty></li>}
          </ul>
        </PlanCard>

        <PlanCard href="/bills" title="Bills and subscriptions" subtitle={`${bills.length} tracked, ${formatMoney(billsMonthly)} a month`}>
          <ul className="-mx-2 space-y-0.5">
            {bills.sort((a, b) => a.days_until_due - b.days_until_due).slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                <span className={cn("text-[0.8125rem]", r.days_until_due <= 3 ? "font-medium text-expense" : "text-muted-foreground")}>{formatDate(r.next_due_on, "MMM d")}</span>
                <span className="tabular w-20 text-right text-sm font-medium">{formatMoney(r.amount_minor)}</span>
              </li>
            ))}
            {bills.length === 0 && <li className="px-2"><RowEmpty>Add rent, utilities and subscriptions.</RowEmpty></li>}
          </ul>
        </PlanCard>

        <PlanCard id="installments" href="/bills" title="Installments and loans" subtitle="Card installments, BNPL and loan amortizations">
          <ul className="space-y-3">
            {installments.map((r) => {
              const left = r.end_on ? Math.max(0, differenceInCalendarMonths(parseISO(r.end_on), parseISO(r.next_due_on)) + 1) : null
              return (
                <li key={r.id}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="tabular font-medium">{formatMoney(r.amount_minor)}</span>
                  </div>
                  <p className="mt-0.5 text-[0.8125rem] text-muted-foreground">
                    {FREQUENCY_LABELS[r.frequency]}, next {formatDate(r.next_due_on, "MMM d")}
                    {left !== null && `. ${left} payment${left === 1 ? "" : "s"} left, ends ${formatDate(r.end_on!, "MMM yyyy")}`}
                  </p>
                </li>
              )
            })}
            {installments.length === 0 && (
              <li className="flex items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-3 text-[0.8125rem]">
                <span className="text-muted-foreground">Track 0% installments and loans</span>
                <Link href="/tools/loan" className="shrink-0 font-medium text-primary hover:opacity-80">Loan calculator</Link>
              </li>
            )}
          </ul>
        </PlanCard>

        <PlanCard href="/debts" title="Money owed" subtitle={`${openDebts.length} open`}>
          <div className="grid grid-cols-2 divide-x rounded-lg bg-muted/50 py-2.5 [&>div]:px-3">
            <Figure label="You owe" value={formatMoney(iOwe)} />
            <Figure label="Owed to you" value={<span className="text-income">{formatMoney(owedToMe)}</span>} />
          </div>
          <ul className="mt-3 space-y-1.5">
            {openDebts.slice(0, 3).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{d.direction === "owed_to_me" ? `${d.counterparty} still owes you` : `You owe ${d.counterparty}`}</span>
                <span className={cn("tabular font-medium", d.direction === "owed_to_me" && "text-income")}>{formatMoney(d.outstanding_minor)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.8125rem] text-muted-foreground">Paid for a group? Open the purchase in History and choose Split with someone.</p>
        </PlanCard>

        <PlanCard href="/bills" title="Income" subtitle="Expected, not spendable until it arrives">
          <ul className="space-y-1.5">
            {income.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="text-[0.8125rem] text-muted-foreground">{formatDate(r.next_due_on, "MMM d")}</span>
                <span className="tabular w-24 text-right font-medium text-income">{formatMoney(r.amount_minor, "PHP", { signed: true })}</span>
              </li>
            ))}
            {income.length === 0 && <li><RowEmpty>Add a salary, allowance or other regular income so Faldo knows how long your money has to last.</RowEmpty></li>}
          </ul>
        </PlanCard>
      </div>

      <Link href="/forecast" className="card-surface group flex items-center gap-4 p-4 transition-colors hover:border-input sm:p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70"><LineChart className="size-5" strokeWidth={1.75} /></span>
        <div className="min-w-0 flex-1">
          <p className="section-title">Cashflow forecast</p>
          {forecast ? (
            <p className="text-[0.8125rem] text-muted-foreground">Expected balance on {formatDate(forecast.horizon_end, "MMM d")}: <span className="tabular font-medium text-foreground">{formatMoney(forecast.end_balance.p50)}</span>.
              Lowest point <span className="tabular">{formatMoney(forecast.lowest_point.p50_minor)}</span> on {formatDate(forecast.lowest_point.date, "MMM d")}.</p>
          ) : <Skeleton className="mt-1 h-4 w-3/4" />}
        </div>
        <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  )
}
