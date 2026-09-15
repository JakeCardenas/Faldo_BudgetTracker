"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { AmountInput } from "@/components/finance/amount-input"
import { Segmented } from "@/components/ios/segmented"
import { Disclaimer, Field } from "@/components/tools/shared"
import { formatMoney, minorToInput, toMinor } from "@/lib/format"
import { useCategories, useDashboard, useMe } from "@/lib/queries"
import { cn } from "@/lib/utils"

const PRESETS = { "50-30-20": [50, 30, 20], "60-20-20": [60, 20, 20], "70-10-20": [70, 10, 20] } as const
type Preset = keyof typeof PRESETS

export function BudgetPlanner() {
  const { data: me } = useMe()
  const { data: dashboard } = useDashboard("this_month")
  const { data: categories = [] } = useCategories()
  const [income, setIncome] = useState(minorToInput(me?.settings.monthly_income_minor ?? null))
  const [preset, setPreset] = useState<Preset>("50-30-20")
  const incomeMinor = toMinor(income) ?? 0
  const [needsPct, wantsPct, savePct] = PRESETS[preset]

  const essential = new Set(categories.filter((c) => c.is_essential).map((c) => c.id))
  const rows = dashboard?.spending_by_category ?? []
  const actualNeeds = rows.filter((r) => r.category_id && essential.has(r.category_id)).reduce((s, r) => s + r.amount_minor, 0)
  const actualWants = rows.filter((r) => !r.category_id || !essential.has(r.category_id)).reduce((s, r) => s + r.amount_minor, 0)
  const actualSaved = incomeMinor - actualNeeds - actualWants

  const buckets = [
    { label: "Needs", pct: needsPct, actual: actualNeeds, color: "var(--primary)", note: "Rent, groceries, bills, transport" },
    { label: "Wants", pct: wantsPct, actual: actualWants, color: "var(--chart-4)", note: "Eating out, shopping, fun" },
    { label: "Savings", pct: savePct, actual: actualSaved, color: "var(--chart-5)", note: "Emergency fund, goals, debt payoff" },
  ]

  return (
    <div className="space-y-4">
      <section className="card-surface grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Monthly take-home pay"><AmountInput value={income} onValueChange={setIncome} placeholder="25,000" className="h-11" /></Field>
        <div className="space-y-1.5"><p className="text-[0.8125rem] text-muted-foreground">Split</p>
          <Segmented label="Split preset" className="w-full" value={preset} onChange={setPreset} options={Object.keys(PRESETS).map((k) => ({ value: k as Preset, label: k.replace(/-/g, "/") }))} /></div>
      </section>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {buckets.map((b) => {
          const planned = Math.round((incomeMinor * b.pct) / 100)
          const over = b.label !== "Savings" ? b.actual > planned : b.actual < planned
          return (
            <section key={b.label} className="card-surface p-5">
              <div className="flex items-center justify-between">
                <p className="text-base font-semibold">{b.label}</p>
                <span className="tabular flex items-center gap-1.5 text-[0.8125rem] font-medium text-muted-foreground"><span className="size-2 rounded-[3px]" style={{ backgroundColor: b.color }} />{b.pct}%</span>
              </div>
              <p className="text-xs text-muted-foreground">{b.note}</p>
              <p className="tabular mt-3 text-3xl font-semibold tracking-[-0.025em]">{formatMoney(planned)}</p>
              <p className="mt-4 text-[0.8125rem] text-muted-foreground">This month so far</p>
              <p className={cn("tabular text-lg font-semibold", incomeMinor > 0 && over ? "text-expense" : "text-foreground")}>{formatMoney(b.actual)}</p>
              {incomeMinor > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, planned > 0 ? (Math.max(0, b.actual) / planned) * 100 : 0)}%`, backgroundColor: b.color }} /></div>}
            </section>
          )
        })}
      </div>
      <Link href="/learn/budget-50-30-20" className="card-surface flex items-center justify-between gap-3 p-4 text-sm font-medium text-primary transition-colors hover:border-input">
        Learn how to adjust the split to your life <ArrowRight className="size-4" />
      </Link>
      <Disclaimer>Needs use the categories you marked as essential in Settings. Savings is income minus spending this month.</Disclaimer>
    </div>
  )
}
