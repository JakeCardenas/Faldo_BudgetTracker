"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { differenceInCalendarMonths, parseISO } from "date-fns"
import { ArrowRight, ChevronRight, CircleAlert, CircleCheck, CircleX, LineChart, Loader2 } from "lucide-react"
import { LargeTitle } from "@/components/ios/nav-header"
import { AmountInput } from "@/components/finance/amount-input"
import { ProgressBar } from "@/components/finance/progress-bar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { FREQUENCY_LABELS, formatDate, formatMoney, formatPct, monthKey, toMinor } from "@/lib/format"
import { GoalIcon } from "@/lib/goal-icons"
import { useBudget, useDebts, useForecast, useGoals, useRecurring } from "@/lib/queries"
import type { ScenarioResult } from "@/lib/types"
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

function AffordCheck() {
  const [amount, setAmount] = useState("")
  const check = useMutation({
    mutationFn: (minor: number) => api.post<ScenarioResult>("/forecast/scenario", {
      horizon: "end_of_month", adjustments: [{ kind: "one_time_expense", amount_minor: minor, label: "Planned purchase" }],
    }),
  })
  const result = check.data
  const verdict = result && {
    comfortable: { label: "Yes, you can afford it", tone: "text-income", icon: CircleCheck },
    tight: { label: "Possible, but it gets tight", tone: "text-warning", icon: CircleAlert },
    not_recommended: { label: "Better to wait on this one", tone: "text-expense", icon: CircleX },
  }[result.verdict]
  const VerdictIcon = verdict?.icon

  return (
    <section className="card-surface p-4 sm:p-5">
      <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,22rem)] md:items-center">
        <div>
          <h2 className="section-title">Can I afford it?</h2>
          <p className="text-[0.8125rem] text-muted-foreground">Check a purchase against your end-of-month balance.</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); const minor = toMinor(amount); if (minor) check.mutate(minor) }} className="flex gap-2">
          <AmountInput value={amount} onValueChange={setAmount} placeholder="3,000" aria-label="Purchase amount" className="flex-1" />
          <Button type="submit" className="h-10" disabled={!toMinor(amount) || check.isPending}>
            {check.isPending && <Loader2 className="animate-spin" />} Check
          </Button>
        </form>
      </div>
      {check.error && <p className="mt-3 text-sm text-destructive">{check.error instanceof ApiError ? check.error.message : "Couldn't check that."}</p>}
      {result && verdict && VerdictIcon && (
        <div className="animate-rise mt-4 border-t pt-4">
          <p className={cn("flex items-center gap-2 text-[0.9375rem] font-medium", verdict.tone)}><VerdictIcon className="size-4.5" strokeWidth={2} /> {verdict.label}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Your balance on {formatDate(result.horizon_end, "MMM d")} would be about <span className="tabular font-medium text-foreground">{formatMoney(result.projected_minor)}</span>
            {result.goal_delay_days ? `, and a goal could slip by ${result.goal_delay_days} days` : ""}.</p>
          <Link href={`/assistant?q=${encodeURIComponent(`Can I afford a ${formatMoney(toMinor(amount) ?? 0)} purchase?`)}`} className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-primary hover:opacity-80">
            Ask Faldo for the full picture <ArrowRight className="size-3.5" />
          </Link>
        </div>
      )}
    </section>
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
      <LargeTitle title="Plan" subtitle="Budgets, goals, bills and debts in one place" />
      <AffordCheck />

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

        <PlanCard href="/debts" title="Debt and owed" subtitle={`${openDebts.length} open`}>
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
          <Link href="/tools/split" className="mt-3 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-primary hover:opacity-80">Split a bill with friends <ArrowRight className="size-3.5" /></Link>
        </PlanCard>

        <PlanCard href="/bills" title="Salary and income" subtitle="Paydays and expected income">
          <ul className="space-y-1.5">
            {income.map((r) => (
              <li key={r.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                <span className="text-[0.8125rem] text-muted-foreground">{formatDate(r.next_due_on, "MMM d")}</span>
                <span className="tabular w-24 text-right font-medium text-income">{formatMoney(r.amount_minor, "PHP", { signed: true })}</span>
              </li>
            ))}
            {income.length === 0 && <li><RowEmpty>Add your salary schedule to see days until payday.</RowEmpty></li>}
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
