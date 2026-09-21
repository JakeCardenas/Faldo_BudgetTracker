"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ArrowRight, BarChart3, ChevronRight, CreditCard, Flag, FlaskConical, GraduationCap, HandCoins, Lightbulb, LineChart, Loader2, PieChart,
  ReceiptText, ShoppingBag, Wallet, Wrench, type LucideIcon,
} from "lucide-react"
import { CheckResultView, useFaldoCheck } from "@/components/decide/faldo-check"
import { AmountInput } from "@/components/finance/amount-input"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { Section } from "@/components/ios/panel"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { formatDate, formatMoney, monthKey, toMinor } from "@/lib/format"
import { useBudget, useDebts, useForecast, useGoals, useMoneyPlan, usePlanned, useRecurring, useUpcoming } from "@/lib/queries"
import { play } from "@/lib/sound"

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



interface PlanItem { href: string; title: string; subtitle: string; icon: LucideIcon; tint: string }

/** One destination in Plan: a tinted icon, what it is and a live summary. */
function PlanRow({ item }: { item: PlanItem }) {
  const Icon = item.icon
  return (
    <li>
      <Link href={item.href} onClick={() => play("tap")}
        className="pressable flex items-center gap-3.5 rounded-[1.125rem] bg-card px-4 py-3.5 shadow-(--shadow-card) transition-colors hover:bg-accent/40">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[0.875rem]"
          style={{ backgroundColor: `color-mix(in oklab, ${item.tint} 14%, transparent)`, color: item.tint }}>
          <Icon className="size-[1.35rem]" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-bold tracking-[-0.01em]">{item.title}</span>
          <span className="block truncate text-[0.8125rem] text-muted-foreground">{item.subtitle}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />
      </Link>
    </li>
  )
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Every planning tool with a live one-line summary, in the order people reach for them. */
function usePlanItems(): PlanItem[] {
  const { data: budget } = useBudget(monthKey())
  const { data: goals = [] } = useGoals()
  const { data: plan } = useMoneyPlan()
  const { data: upcoming = [] } = useUpcoming(30)
  const { data: debts = [] } = useDebts()
  const { data: planned = [] } = usePlanned()
  const { data: recurring = [] } = useRecurring()
  const { data: forecast } = useForecast("end_of_month")

  const activeGoals = goals.filter((g) => g.status === "active").length
  const bills = upcoming.filter((u) => !u.is_income).length
  const open = debts.filter((d) => d.status === "open")
  const iOwe = open.filter((d) => d.direction === "i_owe").reduce((s, d) => s + d.outstanding_minor, 0)
  const owedToMe = open.filter((d) => d.direction === "owed_to_me").reduce((s, d) => s + d.outstanding_minor, 0)
  const wanted = planned.filter((p) => p.status === "planned").length
  const installments = recurring.filter((r) => r.is_active && r.kind === "loan")

  return [
    { href: "/budgets", title: "Budgets", icon: PieChart, tint: "#2c7549",
      subtitle: budget?.lines.length ? `${plural(budget.lines.length, "budget")}, ${formatMoney(budget.total_spent_minor)} of ${formatMoney(budget.total_budgeted_minor)} used` : "Set monthly limits by category" },
    { href: "/goals", title: "Goals", icon: Flag, tint: "#23804c",
      subtitle: activeGoals ? `${plural(activeGoals, "goal")} in progress` : "Save toward something" },
    { href: "/plan/money", title: "Money plan", icon: Wallet, tint: "#3f7f5b",
      subtitle: plan?.configured && plan.income.minor ? `${formatMoney(plan.income.minor)} each payday, split into jobs` : "Give every payday a job" },
    { href: "/bills", title: "Bills and recurring", icon: ReceiptText, tint: "#c98a1e",
      subtitle: bills ? `${plural(bills, "payment")} due in the next 30 days` : "Rent, utilities, subscriptions and income" },
    { href: "/debts", title: "Money owed", icon: HandCoins, tint: "#2f8a6a",
      subtitle: open.length ? `You owe ${formatMoney(iOwe)}, owed to you ${formatMoney(owedToMe)}` : "Utang, loans and split bills" },
    { href: "/plan/purchases", title: "Planned purchases", icon: ShoppingBag, tint: "#7a5bd1",
      subtitle: wanted ? `${plural(wanted, "thing")} you want to buy` : "Faldo tells you when a purchase fits" },
    { href: "/bills", title: "Installments and loans", icon: CreditCard, tint: "#3b6fd4",
      subtitle: installments.length ? `${installments.length} active, ${formatMoney(installments.reduce((s, r) => s + r.monthly_equivalent_minor, 0))} a month` : "Card installments, BNPL and loans" },
    { href: "/forecast", title: "Forecast", icon: LineChart, tint: "#1f8a86",
      subtitle: forecast ? `Estimated ${formatMoney(forecast.end_balance.p50)} on ${formatDate(forecast.horizon_end, "MMM d")}` : "Where your balance is heading" },
    { href: "/forecast#what-if", title: "What if", icon: FlaskConical, tint: "#8a5bb8", subtitle: "Try spending or saving more and see the effect" },
  ]
}

const MORE: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/reports", label: "Statistics", icon: BarChart3 },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/learn", label: "Learn", icon: GraduationCap },
]

/** Money ahead: every planning tool one tap away, with the purchase check beside them. */
export default function PlanPage() {
  const router = useRouter()
  const items = usePlanItems()
  return (
    <div className="space-y-5">
      <LargeTitle title="Plan" subtitle="Budgets, goals, bills and what's ahead"
        actions={<div className="flex gap-2">
          <HeaderButton onClick={() => router.push("/forecast")} aria-label="Forecast"><LineChart /></HeaderButton>
          <HeaderButton onClick={() => router.push("/reports")} aria-label="Statistics"><BarChart3 /></HeaderButton>
        </div>} />
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        <ul className="space-y-2.5">
          {items.map((item) => <PlanRow key={item.title} item={item} />)}
        </ul>
        <div className="space-y-6">
          <AffordCheck />
          <ul className="grid grid-cols-2 gap-2.5">
            {MORE.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} onClick={() => play("tap")}
                  className="pressable flex items-center gap-2.5 rounded-[1rem] bg-card px-3.5 py-3 shadow-(--shadow-card) transition-colors hover:bg-accent/40">
                  <Icon className="size-[1.15rem] text-primary" strokeWidth={1.9} />
                  <span className="min-w-0 flex-1 truncate text-[0.875rem] font-bold">{label}</span>
                  <ChevronRight className="size-3.5 text-muted-foreground/60" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
