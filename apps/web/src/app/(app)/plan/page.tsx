"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { differenceInCalendarMonths, parseISO } from "date-fns"
import {
  ArrowRight, Briefcase, CalendarClock, ChevronRight, CreditCard, Flag, HandCoins, LineChart, Loader2, PiggyBank, Repeat, Sparkles,
} from "lucide-react"
import { Mascot } from "@/components/brand/mascot"
import { Donut } from "@/components/home/cards"
import { LargeTitle } from "@/components/ios/nav-header"
import { AmountInput } from "@/components/finance/amount-input"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { FREQUENCY_LABELS, formatDate, formatMoney, formatPct, monthKey, toMinor } from "@/lib/format"
import { useBudget, useDebts, useForecast, useGoals, useMe, useRecurring } from "@/lib/queries"
import type { ScenarioResult } from "@/lib/types"
import { cn } from "@/lib/utils"

function PlanCard({ href, icon: Icon, title, subtitle, children, id, tone = "bg-secondary text-primary" }: {
  href: string
  icon: typeof PiggyBank
  title: string
  subtitle: string
  children: React.ReactNode
  id?: string
  tone?: string
}) {
  return (
    <section id={id} className="card-surface min-w-0 scroll-mt-24 p-4 sm:p-5">
      <Link href={href} className="flex items-center gap-3">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-2xl", tone)}><Icon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold tracking-tight">{title}</h2>
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function AffordCheck() {
  const { data: me } = useMe()
  const [amount, setAmount] = useState("")
  const check = useMutation({
    mutationFn: (minor: number) => api.post<ScenarioResult>("/forecast/scenario", {
      horizon: "end_of_month", adjustments: [{ kind: "one_time_expense", amount_minor: minor, label: "Planned purchase" }],
    }),
  })
  const result = check.data
  const verdict = result && {
    comfortable: { label: "Yes, you can afford it", tone: "bg-income-soft text-income", mood: "proud" as const },
    tight: { label: "Possible, but it gets tight", tone: "bg-warning-soft text-warning", mood: "worried" as const },
    not_recommended: { label: "Better to wait on this one", tone: "bg-expense-soft text-expense", mood: "worried" as const },
  }[result.verdict]

  return (
    <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-hero to-hero-deep p-5 text-white shadow-(--shadow-float)">
      <div className="relative flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-[0.66rem] font-bold tracking-[0.12em] text-white/70 uppercase">Before you buy</p>
            <h2 className="text-xl font-extrabold tracking-tight">Can I afford it?</h2>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); const minor = toMinor(amount); if (minor) check.mutate(minor) }} className="flex gap-2">
            <AmountInput value={amount} onValueChange={setAmount} placeholder="e.g. 3,000" aria-label="Purchase amount"
              className="h-11 flex-1 rounded-xl border-0 bg-white text-base text-foreground sm:text-sm" />
            <button type="submit" disabled={!toMinor(amount) || check.isPending}
              className="pressable flex h-11 items-center gap-1.5 rounded-xl bg-white/20 px-4 text-sm font-bold backdrop-blur disabled:opacity-50">
              {check.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Check
            </button>
          </form>
        </div>
        <Mascot mood={verdict?.mood ?? "happy"} outfit={me?.settings.mascot_outfit} className="-mt-1 -mr-1 w-20 shrink-0 drop-shadow-md sm:w-24" />
      </div>
      {check.error && <p className="relative mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm">{check.error instanceof ApiError ? check.error.message : "Couldn't check that."}</p>}
      {result && verdict && (
        <div className="relative mt-3 space-y-2 rounded-2xl bg-card p-4 text-card-foreground">
          <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold", verdict.tone)}>{verdict.label}</span>
          <p className="text-sm">Your balance on {formatDate(result.horizon_end, "MMM d")} would be about <span className="font-extrabold">{formatMoney(result.projected_minor)}</span>
            {result.goal_delay_days ? `, and a goal could slip by ${result.goal_delay_days} days` : ""}.</p>
          <Link href={`/assistant?q=${encodeURIComponent(`Can I afford a ${formatMoney(toMinor(amount) ?? 0)} purchase?`)}`} className="inline-flex items-center gap-1 text-xs font-bold text-primary">
            Ask Faldo for the full picture <ArrowRight className="size-3" />
          </Link>
        </div>
      )}
    </section>
  )
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
      <LargeTitle title="Plan" subtitle="Budgets, goals, bills and debts in one place." />
      <AffordCheck />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlanCard href="/budgets" icon={PiggyBank} title="Budgets" subtitle="Monthly limits by category">
          {budgetLoading ? <Skeleton className="h-24 rounded-xl" /> : !budget?.lines.length ? (
            <p className="rounded-2xl border border-dashed py-5 text-center text-sm font-semibold text-muted-foreground">Set limits and Faldo warns you early.</p>
          ) : (
            <div className="flex items-center gap-4">
              <Donut size="size-24" data={[{ value: Math.min(100, budgetPct), color: budgetPct > 100 ? "var(--expense)" : "var(--primary)" }, { value: Math.max(0, 100 - budgetPct), color: "transparent" }]}
                center={<><span className="tabular text-lg font-extrabold">{Math.round(budgetPct)}%</span><span className="text-[0.6rem] text-muted-foreground">used</span></>} />
              <ul className="min-w-0 flex-1 space-y-2">
                {[...budget.lines].sort((a, b) => b.pct_used - a.pct_used).slice(0, 3).map((l) => (
                  <li key={l.id} className="space-y-1">
                    <div className="flex justify-between gap-2 text-xs"><span className="truncate font-bold">{l.category_name}</span><span className="tabular text-muted-foreground">{formatPct(l.pct_used)}</span></div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, l.pct_used)}%`, backgroundColor: l.status === "over" ? "var(--expense)" : l.category_color ?? "var(--primary)" }} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </PlanCard>

        <PlanCard href="/goals" icon={Flag} title="Goals" subtitle="Save for what matters">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-muted/60 p-2.5"><p className="eyebrow">Saved</p><p className="tabular text-sm font-extrabold">{formatMoney(saved, "PHP", { compact: true })}</p></div>
            <div className="rounded-2xl bg-muted/60 p-2.5"><p className="eyebrow">Active</p><p className="tabular text-sm font-extrabold">{activeGoals.length}</p></div>
            <div className="rounded-2xl bg-muted/60 p-2.5"><p className="eyebrow">Target</p><p className="tabular text-sm font-extrabold">{formatMoney(targeted, "PHP", { compact: true })}</p></div>
          </div>
          <ul className="mt-3 space-y-1.5">
            {activeGoals.slice(0, 2).map((g) => (
              <li key={g.id} className="flex items-center gap-2 text-sm">
                <span aria-hidden>{g.emoji ?? "🎯"}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{g.name}</span>
                <span className="tabular text-xs font-bold text-primary">{formatPct(g.pct_complete)}</span>
              </li>
            ))}
          </ul>
        </PlanCard>

        <PlanCard href="/bills" icon={Repeat} title="Bills & subscriptions" subtitle={`${bills.length} tracked · ${formatMoney(billsMonthly)} a month`}>
          <ul className="space-y-1">
            {bills.sort((a, b) => a.days_until_due - b.days_until_due).slice(0, 4).map((r) => (
              <li key={r.id} className={cn("flex items-center gap-3 rounded-xl px-2 py-1.5", r.days_until_due <= 3 && "bg-expense-soft")}>
                <CalendarClock className={cn("size-4 shrink-0", r.days_until_due <= 3 ? "text-expense" : "text-muted-foreground")} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{r.name}</span>
                <span className="text-xs text-muted-foreground">{formatDate(r.next_due_on, "MMM d")}</span>
                <span className="tabular w-20 text-right text-sm font-bold">{formatMoney(r.amount_minor)}</span>
              </li>
            ))}
            {bills.length === 0 && <li className="py-3 text-center text-sm text-muted-foreground">Add rent, utilities and subscriptions.</li>}
          </ul>
        </PlanCard>

        <PlanCard id="installments" href="/bills" icon={CreditCard} title="Installments & loans" subtitle="Card installments, BNPL and loan amortizations" tone="bg-[#e8eefb] text-[#3f64b5] dark:bg-[#1d2740] dark:text-[#9db6ec]">
          <ul className="space-y-3">
            {installments.map((r) => {
              const left = r.end_on ? Math.max(0, differenceInCalendarMonths(parseISO(r.end_on), parseISO(r.next_due_on)) + 1) : null
              return (
                <li key={r.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-bold">{r.name}</span>
                    <span className="tabular font-extrabold">{formatMoney(r.amount_minor)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {FREQUENCY_LABELS[r.frequency]} · next {formatDate(r.next_due_on, "MMM d")}
                    {left !== null && ` · ${left} payment${left === 1 ? "" : "s"} left, ends ${formatDate(r.end_on!, "MMM yyyy")}`}
                  </p>
                </li>
              )
            })}
            {installments.length === 0 && (
              <li className="flex items-center justify-between gap-3 rounded-2xl border border-dashed p-3 text-sm">
                <span className="text-muted-foreground">Track 0% installments and loans</span>
                <Link href="/tools/loan" className="shrink-0 font-bold text-primary">Loan calculator</Link>
              </li>
            )}
          </ul>
        </PlanCard>

        <PlanCard href="/debts" icon={HandCoins} title="Debt & owed" subtitle={`${openDebts.length} open`} tone="bg-warning-soft text-warning">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-expense-soft p-3"><p className="eyebrow text-expense">You owe</p><p className="tabular text-lg font-extrabold">{formatMoney(iOwe)}</p></div>
            <div className="rounded-2xl bg-income-soft p-3"><p className="eyebrow text-income">Owed to you</p><p className="tabular text-lg font-extrabold">{formatMoney(owedToMe)}</p></div>
          </div>
          <ul className="mt-3 space-y-1">
            {openDebts.slice(0, 3).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{d.direction === "owed_to_me" ? `${d.counterparty} still owes you` : `You owe ${d.counterparty}`}</span>
                <span className={cn("tabular font-bold", d.direction === "owed_to_me" ? "text-income" : "text-expense")}>{formatMoney(d.outstanding_minor)}</span>
              </li>
            ))}
          </ul>
          <Link href="/tools/split" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary">Split a bill with friends <ArrowRight className="size-3" /></Link>
        </PlanCard>

        <PlanCard href="/bills" icon={Briefcase} title="Salary & income" subtitle="Paydays and expected income" tone="bg-income-soft text-income">
          <ul className="space-y-1.5">
            {income.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                <span className="text-xs text-muted-foreground">{formatDate(r.next_due_on, "MMM d")}</span>
                <span className="tabular w-24 text-right font-bold text-income">{formatMoney(r.amount_minor, "PHP", { signed: true })}</span>
              </li>
            ))}
            {income.length === 0 && <li className="py-3 text-center text-sm text-muted-foreground">Add your salary schedule to see days until payday.</li>}
          </ul>
        </PlanCard>
      </div>

      <Link href="/forecast" className="card-surface pressable flex items-center gap-4 p-4 sm:p-5">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary"><LineChart className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Cashflow forecast</p>
          {forecast ? (
            <p className="text-sm">Expected balance on {formatDate(forecast.horizon_end, "MMM d")}: <span className="font-extrabold">{formatMoney(forecast.end_balance.p50)}</span>
              <span className="text-muted-foreground"> · lowest {formatMoney(forecast.lowest_point.p50_minor)} on {formatDate(forecast.lowest_point.date, "MMM d")}</span></p>
          ) : <Skeleton className="mt-1 h-4 w-3/4" />}
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    </div>
  )
}
