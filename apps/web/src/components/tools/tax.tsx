"use client"

import { useState } from "react"
import { AmountInput } from "@/components/finance/amount-input"
import { Disclaimer, Field, ResultRow } from "@/components/tools/shared"
import { formatMoney, toMinor } from "@/lib/format"

const BRACKETS = [
  { upTo: 250_000, base: 0, rate: 0, over: 0 },
  { upTo: 400_000, base: 0, rate: 0.15, over: 250_000 },
  { upTo: 800_000, base: 22_500, rate: 0.2, over: 400_000 },
  { upTo: 2_000_000, base: 102_500, rate: 0.25, over: 800_000 },
  { upTo: 8_000_000, base: 402_500, rate: 0.3, over: 2_000_000 },
  { upTo: Infinity, base: 2_202_500, rate: 0.35, over: 8_000_000 },
]

export function annualIncomeTax(taxable: number) {
  const bracket = BRACKETS.find((b) => taxable <= b.upTo) ?? BRACKETS[BRACKETS.length - 1]
  return Math.max(0, bracket.base + (taxable - bracket.over) * bracket.rate)
}

export function TaxCalculator() {
  const [gross, setGross] = useState("35,000")
  const [contributions, setContributions] = useState("2,000")
  const [allowances, setAllowances] = useState("")
  const monthly = (toMinor(gross) ?? 0) / 100
  const deductions = (toMinor(contributions) ?? 0) / 100
  const other = (toMinor(allowances) ?? 0) / 100
  const thirteenth = monthly
  const annualTaxable = Math.max(0, (monthly - deductions + other) * 12 + Math.max(0, thirteenth - 90_000))
  const tax = annualIncomeTax(annualTaxable)
  const monthlyTax = tax / 12
  const takeHome = monthly + other - deductions - monthlyTax
  const effective = monthly > 0 ? (tax / ((monthly + other) * 13)) * 100 : 0
  const peso = (value: number) => formatMoney(Math.round(value * 100))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card-surface space-y-4 p-5">
        <Field label="Monthly basic salary" hint="Your gross pay before deductions."><AmountInput value={gross} onValueChange={setGross} className="h-11" /></Field>
        <Field label="Monthly SSS, PhilHealth & Pag-IBIG" hint="Your employee share. These are deducted before tax."><AmountInput value={contributions} onValueChange={setContributions} className="h-11" /></Field>
        <Field label="Other taxable pay per month" hint="Overtime, taxable allowances or commissions."><AmountInput value={allowances} onValueChange={setAllowances} placeholder="0" className="h-11" /></Field>
      </section>
      <section className="card-surface p-5">
        <p className="text-[0.8125rem] text-muted-foreground">Estimated monthly take-home</p>
        <p className="tabular mt-1 text-[2.25rem] leading-tight font-semibold tracking-[-0.03em]">{peso(Math.max(0, takeHome))}</p>
        <div className="mt-4">
          <ResultRow label="Annual taxable income" value={peso(annualTaxable)} />
          <ResultRow label="Annual income tax" value={peso(tax)} tone="expense" />
          <ResultRow label="Withholding tax per month" value={peso(monthlyTax)} />
          <ResultRow label="Effective tax rate" value={`${effective.toFixed(1)}%`} />
          <ResultRow label="13th month pay (tax-free up to ₱90,000)" value={peso(thirteenth)} tone="income" />
        </div>
      </section>
      <div className="lg:col-span-2">
        <Disclaimer>Uses the TRAIN law income tax table for 2023 onwards and assumes one month of 13th month pay. Your payslip may differ because of de minimis benefits and payroll timing.</Disclaimer>
      </div>
    </div>
  )
}
