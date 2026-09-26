"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowRight, BarChart3, Flag, LineChart, Loader2, PieChart, ReceiptText, ShoppingBag, Wallet } from "lucide-react"
import { MoneyOwedIcon } from "@/components/finance/category-icon"
import { CheckResultView, useFaldoCheck } from "@/components/decide/faldo-check"
import { AmountInput } from "@/components/finance/amount-input"
import { ListGroup, ListRow } from "@/components/ios/list"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { Section } from "@/components/ios/panel"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { formatMoney, monthKey, relativeDays, toMinor } from "@/lib/format"
import { useMaskedAmounts } from "@/lib/privacy"
import { useBudget, useDebts, useForecast, useGoals, useMoneyPlan, usePlanned, useUpcoming } from "@/lib/queries"

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

/** One plain line per tool saying where things stand, from data the app already loads. Blank while loading. */
function usePlanStatus(): Record<string, string | null> {
  const budget = useBudget(monthKey()).data
  const goals = useGoals().data
  const plan = useMoneyPlan().data
  const upcoming = useUpcoming(30).data
  const debts = useDebts().data
  const planned = usePlanned().data
  const forecast = useForecast("end_of_month").data

  const budgetLine = () => {
    if (!budget) return null
    const limit = budget.total_limit_minor ?? budget.total_budgeted_minor
    if (!budget.lines.length && !budget.total_limit_minor) return "Not set for this month"
    const left = limit - budget.total_spent_minor
    return left >= 0 ? `${formatMoney(left)} left of ${formatMoney(limit)}` : `${formatMoney(-left)} over this month`
  }
  const goalLine = () => {
    if (!goals) return null
    const active = goals.filter((g) => g.status === "active")
    if (!active.length) return "Start saving toward something"
    const saved = active.reduce((sum, g) => sum + g.saved_minor, 0)
    return `${active.length} ${active.length === 1 ? "goal" : "goals"}, ${formatMoney(saved)} saved`
  }
  const planLine = () => {
    if (!plan) return null
    if (!plan.configured) return "Split your pay into needs, joy and savings"
    if (!plan.this_period) return "Your plan is set"
    const left = plan.this_period.joy_left_minor
    return left >= 0 ? `Joy Money ${formatMoney(left)} left` : `Joy Money ${formatMoney(-left)} over`
  }
  const billLine = () => {
    if (!upcoming) return null
    const next = upcoming.find((u) => !u.is_income)
    if (!next) return "Nothing due in the next 30 days"
    return `${next.name} ${next.is_overdue ? "is overdue" : `due ${relativeDays(next.days_until_due).toLowerCase()}`}, ${formatMoney(next.amount_minor)}`
  }
  const debtLine = () => {
    if (!debts) return null
    const open = debts.filter((d) => d.status === "open")
    const owe = open.filter((d) => d.direction === "i_owe").reduce((sum, d) => sum + d.outstanding_minor, 0)
    const owed = open.filter((d) => d.direction === "owed_to_me").reduce((sum, d) => sum + d.outstanding_minor, 0)
    if (!owe && !owed) return "All settled"
    return [owe && `You owe ${formatMoney(owe)}`, owed && `owed ${formatMoney(owed)}`].filter(Boolean).join(", ")
  }
  const plannedLine = () => {
    if (!planned) return null
    const open = planned.filter((p) => p.status === "planned")
    if (!open.length) return "Nothing planned yet"
    const fits = open.filter((p) => p.verdict === "fits").length
    return `${open.length} planned${fits ? `, ${fits} ${fits === 1 ? "fits" : "fit"} now` : ""}`
  }
  const forecastLine = () => forecast ? `About ${formatMoney(forecast.end_balance.p50)} by month end` : null

  return {
    "/budgets": budgetLine(), "/goals": goalLine(), "/plan/money": planLine(), "/bills": billLine(),
    "/debts": debtLine(), "/plan/purchases": plannedLine(), "/forecast": forecastLine(),
  }
}

/** Every planning tool, one tap away, in the order people reach for them. What-ifs live in Forecast. */
const PLAN_ITEMS = [
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/goals", label: "Goals", icon: Flag },
  { href: "/plan/money", label: "Money plan", icon: Wallet },
  { href: "/bills", label: "Bills and recurring", icon: ReceiptText },
  { href: "/debts", label: "Money owed", icon: MoneyOwedIcon },
  { href: "/plan/purchases", label: "Planned purchases", icon: ShoppingBag },
  { href: "/forecast", label: "Forecast", icon: LineChart },
]

/** Money ahead: every planning tool in a plain list, with the purchase check beside them. */
export default function PlanPage() {
  useMaskedAmounts()
  const router = useRouter()
  const status = usePlanStatus()
  return (
    <div className="space-y-5">
      <LargeTitle title="Plan" subtitle="Budgets, goals, bills and what's ahead"
        actions={<HeaderButton onClick={() => router.push("/reports")} aria-label="Statistics"><BarChart3 /></HeaderButton>} />
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        <ListGroup className="cascade">
          {PLAN_ITEMS.map((item) => <ListRow key={item.href} icon={item.icon} title={item.label} detail={status[item.href] ?? ""} href={item.href} />)}
        </ListGroup>
        <AffordCheck />
      </div>
    </div>
  )
}
