"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ArrowRight, BarChart3, Flag, HandCoins, LineChart, Loader2, PieChart, ReceiptText, ShoppingBag, Wallet } from "lucide-react"
import { CheckResultView, useFaldoCheck } from "@/components/decide/faldo-check"
import { AmountInput } from "@/components/finance/amount-input"
import { ListGroup, ListRow } from "@/components/ios/list"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { Section } from "@/components/ios/panel"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api"
import { formatMoney, toMinor } from "@/lib/format"

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

/** Every planning tool, one tap away, in the order people reach for them. What-ifs live in Forecast. */
const PLAN_ITEMS = [
  { href: "/budgets", label: "Budgets", icon: PieChart },
  { href: "/goals", label: "Goals", icon: Flag },
  { href: "/plan/money", label: "Money plan", icon: Wallet },
  { href: "/bills", label: "Bills and recurring", icon: ReceiptText },
  { href: "/debts", label: "Money owed", icon: HandCoins },
  { href: "/plan/purchases", label: "Planned purchases", icon: ShoppingBag },
  { href: "/forecast", label: "Forecast", icon: LineChart },
]

/** Money ahead: every planning tool in a plain list, with the purchase check beside them. */
export default function PlanPage() {
  const router = useRouter()
  return (
    <div className="space-y-5">
      <LargeTitle title="Plan" subtitle="Budgets, goals, bills and what's ahead"
        actions={<HeaderButton onClick={() => router.push("/reports")} aria-label="Statistics"><BarChart3 /></HeaderButton>} />
      <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-10">
        <ListGroup className="cascade">
          {PLAN_ITEMS.map((item) => <ListRow key={item.href} icon={item.icon} title={item.label} href={item.href} />)}
        </ListGroup>
        <AffordCheck />
      </div>
    </div>
  )
}
