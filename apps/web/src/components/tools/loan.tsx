"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { addMonths, format } from "date-fns"
import { CalendarPlus } from "lucide-react"
import { toast } from "sonner"
import { AmountInput } from "@/components/finance/amount-input"
import { Segmented } from "@/components/ios/segmented"
import { Disclaimer, Field, ResultRow, inputClass } from "@/components/tools/shared"
import { api, ApiError } from "@/lib/api"
import { formatMoney, toMinor, todayISO } from "@/lib/format"
import { invalidateFinancialData } from "@/lib/queries"

type Mode = "addon" | "annual"

function effectiveAnnualRate(principal: number, payment: number, months: number) {
  if (payment * months <= principal) return 0
  let r = 0.01
  for (let i = 0; i < 60; i++) {
    const f = payment * (1 - (1 + r) ** -months) / r - principal
    const df = payment * (months * (1 + r) ** (-months - 1) / r - (1 - (1 + r) ** -months) / (r * r))
    const next = r - f / df
    if (!Number.isFinite(next) || next <= 0) break
    if (Math.abs(next - r) < 1e-10) { r = next; break }
    r = next
  }
  return ((1 + r) ** 12 - 1) * 100
}

export function LoanCalculator() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<Mode>("addon")
  const [name, setName] = useState("Phone installment")
  const [principal, setPrincipal] = useState("60,000")
  const [rate, setRate] = useState("1.5")
  const [months, setMonths] = useState("12")
  const [fee, setFee] = useState("")
  const [firstDue, setFirstDue] = useState(format(addMonths(new Date(), 1), "yyyy-MM-dd"))
  const [saving, setSaving] = useState(false)

  const p = (toMinor(principal) ?? 0) / 100
  const n = Math.max(1, Math.min(360, Number(months) || 1))
  const rt = (Number(rate) || 0) / 100
  const f = (toMinor(fee) ?? 0) / 100
  let payment: number
  if (mode === "addon") payment = (p + p * rt * n) / n
  else {
    const monthly = rt / 12
    payment = monthly === 0 ? p / n : (p * monthly) / (1 - (1 + monthly) ** -n)
  }
  const total = payment * n
  const interest = total - p
  const ear = effectiveAnnualRate(p - f, payment, n)
  const peso = (v: number) => formatMoney(Math.round(v * 100))

  async function track() {
    setSaving(true)
    try {
      await api.post("/recurring", {
        name: name.trim() || "Installment", kind: "loan", amount_minor: Math.round(payment * 100), frequency: "monthly",
        next_due_on: firstDue, end_on: format(addMonths(new Date(`${firstDue}T00:00:00`), n - 1), "yyyy-MM-dd"),
      })
      await invalidateFinancialData(qc)
      toast.success("Added to your installments")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't add it.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="card-surface space-y-4 p-5">
        <Segmented label="Interest type" className="w-full" value={mode} onChange={setMode}
          options={[{ value: "addon", label: "Add-on (monthly)" }, { value: "annual", label: "Annual (diminishing)" }]} />
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputClass} /></Field>
        <Field label="Amount financed"><AmountInput value={principal} onValueChange={setPrincipal} className="h-11" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === "addon" ? "Rate / month %" : "Rate / year %"}>
            <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Months"><input value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={inputClass} /></Field>
        </div>
        <Field label="One-time fees" hint="Processing or documentary fees deducted upfront."><AmountInput value={fee} onValueChange={setFee} placeholder="0" className="h-11" /></Field>
      </section>
      <section className="card-surface flex flex-col p-5">
        <p className="text-[0.8125rem] text-muted-foreground">Monthly payment</p>
        <p className="tabular mt-1 text-[2.25rem] leading-tight font-semibold tracking-[-0.03em]">{peso(payment)}</p>
        <div className="mt-4 flex-1">
          <ResultRow label="Total interest" value={peso(interest)} tone="expense" />
          <ResultRow label="Fees" value={peso(f)} />
          <ResultRow label="Total you'll pay" value={peso(total + f)} />
          <ResultRow label="True yearly cost (effective rate)" value={`${ear.toFixed(1)}%`} strong />
        </div>
        {mode === "addon" && rt > 0 && <p className="mt-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">A {rate}% monthly add-on rate is really about {ear.toFixed(0)}% a year, because interest is charged on the full amount the whole time.</p>}
        <div className="mt-4 flex items-end gap-2">
          <Field label="First payment" className="flex-1"><input type="date" value={firstDue} min={todayISO()} onChange={(e) => setFirstDue(e.target.value)} className={inputClass} /></Field>
          <button type="button" onClick={track} disabled={saving || payment <= 0} className="pressable flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40">
            <CalendarPlus className="size-4" /> Track it
          </button>
        </div>
      </section>
      <div className="lg:col-span-2"><Disclaimer>An estimate for comparison. Your lender's disclosure statement is the final word on rates and fees.</Disclaimer></div>
    </div>
  )
}
