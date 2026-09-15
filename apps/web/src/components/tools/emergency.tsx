"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowRight, Wand2 } from "lucide-react"
import { AmountInput } from "@/components/finance/amount-input"
import { Segmented } from "@/components/ios/segmented"
import { Disclaimer, Field, ResultRow } from "@/components/tools/shared"
import { formatMoney, minorToInput, toMinor } from "@/lib/format"
import { useAccounts, useDashboard } from "@/lib/queries"

export function EmergencyFund() {
  const { data: dashboard } = useDashboard("last_90_days")
  const { data: accounts = [] } = useAccounts()
  const [essentials, setEssentials] = useState("")
  const [saved, setSaved] = useState("")
  const [months, setMonths] = useState<"3" | "6" | "9" | "12">("6")
  const [timeline, setTimeline] = useState<"6" | "12" | "24">("12")

  const essentialsMinor = toMinor(essentials) ?? 0
  const savedMinor = toMinor(saved) ?? 0
  const target = essentialsMinor * Number(months)
  const gap = Math.max(0, target - savedMinor)
  const monthly = Math.ceil(gap / Number(timeline))
  const pct = target > 0 ? Math.min(100, (savedMinor / target) * 100) : 0

  function useMyNumbers() {
    if (dashboard) setEssentials(minorToInput(Math.round(dashboard.overview.expense_minor / 3)))
    const savings = accounts.filter((a) => !a.archived && a.type === "savings").reduce((s, a) => s + Math.max(0, a.balance_minor), 0)
    setSaved(minorToInput(savings))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card-surface space-y-4 p-5">
        <button type="button" onClick={useMyNumbers} className="pressable flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-secondary text-sm font-bold text-secondary-foreground">
          <Wand2 className="size-4" /> Fill in from my Faldo data
        </button>
        <Field label="Monthly essential expenses" hint="Rent, food, bills, transport and minimum debt payments."><AmountInput value={essentials} onValueChange={setEssentials} placeholder="15,000" className="h-12 rounded-2xl" /></Field>
        <Field label="Already saved for emergencies"><AmountInput value={saved} onValueChange={setSaved} placeholder="0" className="h-12 rounded-2xl" /></Field>
        <div className="space-y-1.5"><p className="eyebrow">Months of cover</p>
          <Segmented label="Months of cover" className="w-full" value={months} onChange={setMonths} options={["3", "6", "9", "12"].map((m) => ({ value: m as "3", label: `${m} mo` }))} /></div>
        <div className="space-y-1.5"><p className="eyebrow">Reach it in</p>
          <Segmented label="Timeline" className="w-full" value={timeline} onChange={setTimeline} options={[{ value: "6", label: "6 months" }, { value: "12", label: "1 year" }, { value: "24", label: "2 years" }]} /></div>
      </section>
      <section className="card-surface flex flex-col p-5">
        <p className="eyebrow">Your emergency fund target</p>
        <p className="tabular text-4xl font-extrabold tracking-tight text-primary">{formatMoney(target)}</p>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1 text-xs text-muted-foreground">{pct.toFixed(0)}% funded</p>
        <div className="mt-4 flex-1">
          <ResultRow label="Still to save" value={formatMoney(gap)} />
          <ResultRow label={`Save per month for ${timeline} months`} value={formatMoney(monthly)} strong />
        </div>
        <Link href="/goals" className="pressable mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground">Create an emergency fund goal <ArrowRight className="size-4" /></Link>
      </section>
      <div className="lg:col-span-2"><Disclaimer>3 to 6 months of essentials is a common rule of thumb. Freelancers and single-income families often aim higher.</Disclaimer></div>
    </div>
  )
}
