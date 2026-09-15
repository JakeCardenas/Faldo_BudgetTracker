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
        <Field label="Monthly take-home pay"><AmountInput value={income} onValueChange={setIncome} placeholder="25,000" className="h-12 rounded-2xl" /></Field>
        <div className="space-y-1.5"><p className="eyebrow">Split</p>
          <Segmented label="Split preset" className="w-full" value={preset} onChange={setPreset} options={Object.keys(PRESETS).map((k) => ({ value: k as Preset, label: k.replace(/-/g, "/") }))} /></div>
      </section>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {buckets.map((b) => {
          const planned = Math.round((incomeMinor * b.pct) / 100)
          const over = b.label !== "Savings" ? b.actual > planned : b.actual < planned
          return (
            <section key={b.label} className="card-surface p-5">
              <div className="flex items-center justify-between">
                <p className="text-base font-extrabold">{b.label}</p>
                <span className="rounded-full px-2.5 py-1 text-xs font-extrabold text-white" style={{ backgroundColor: b.color }}>{b.pct}%</span>
              </div>
              <p className="text-xs text-muted-foreground">{b.note}</p>
              <p className="tabular mt-3 text-3xl font-extrabold tracking-tight">{formatMoney(planned)}</p>
              <p className="eyebrow mt-3">This month so far</p>
              <p className={cn("tabular text-lg font-extrabold", incomeMinor > 0 && over ? "text-expense" : "text-income")}>{formatMoney(b.actual)}</p>
              {incomeMinor > 0 && <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${Math.min(100, planned > 0 ? (Math.max(0, b.actual) / planned) * 100 : 0)}%`, backgroundColor: b.color }} /></div>}
            </section>
          )
        })}
      </div>
      <Link href="/learn/budget-50-30-20" className="card-surface pressable flex items-center justify-between gap-3 p-4 text-sm font-bold text-primary">
        Learn how to adjust the split to your life <ArrowRight className="size-4" />
      </Link>
      <Disclaimer>Needs use the categories you marked as essential in Settings. Savings is income minus spending this month.</Disclaimer>
    </div>
  )
}
