"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, Calculator, CircleDashed, ShieldCheck } from "lucide-react"
import { CalculationCard } from "@/components/finance/calculation-card"
import { AnimatedMoney } from "@/components/finance/money"
import { IosSheet } from "@/components/ios/sheet"
import { formatDate, formatMoney } from "@/lib/format"
import type { SafeToSpend } from "@/lib/types"
import { cn } from "@/lib/utils"

export function untilPhrase(sts: SafeToSpend) {
  if (sts.period === "until_income" && sts.next_income_on) {
    return `until ${sts.next_income_label ?? "your next income"} on ${formatDate(sts.next_income_on, "MMM d")}`
  }
  return "for the next 30 days"
}

export function statusSentence(sts: SafeToSpend) {
  const until = untilPhrase(sts)
  if (sts.status === "short") return `${formatMoney(sts.shortfall_minor)} short for what's due ${sts.period === "until_income" ? "before your next income" : "in the next 30 days"}.`
  if (sts.status === "tight") return `You've used this week's share. About ${formatMoney(sts.per_day_minor)} a day ${until}.`
  return `About ${formatMoney(sts.per_day_minor)} a day ${until}.`
}

/** The breakdown behind the number, straight from the engine's calculation lines. */
export function SafeToSpendWhy({ sts, open, onOpenChange }: { sts: SafeToSpend; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <IosSheet open={open} onOpenChange={onOpenChange} title="Why this number?" size="sm"
      description="Money you already have, minus what's already spoken for. Expected income is never added.">
      <CalculationCard title={`Safe to spend ${untilPhrase(sts)}`} lines={sts.lines} resultLabel="Safe to spend" resultMinor={sts.raw_minor} note={sts.note} />
      <Link href="/forecast" onClick={() => onOpenChange(false)} className="mt-4 inline-flex text-sm font-medium text-primary hover:opacity-80">See the forecast</Link>
    </IosSheet>
  )
}

/**
 * Safe to Spend as a calm status: a light surface with the number, one sentence and this week's share.
 * Amber when this week's share is used, red only when money is genuinely short. Figures come from the engine.
 */
export function SafeToSpendCard({ sts, className }: { sts: SafeToSpend; className?: string }) {
  const [why, setWhy] = useState(false)
  const week = sts.week
  const short = sts.status === "short"
  const tight = sts.status === "tight"
  const used = week.allowance_minor > 0 ? Math.min(100, (week.spent_minor / week.allowance_minor) * 100) : week.spent_minor > 0 ? 100 : 0
  const Icon = short ? AlertTriangle : tight ? CircleDashed : ShieldCheck

  return (
    <section aria-labelledby="sts-title" className={cn("card-surface rounded-[1.5rem] p-5", short && "bg-danger-soft shadow-none", className)}>
      <div className="flex items-start gap-3.5">
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full",
          short ? "bg-card text-expense" : tight ? "bg-warning-soft text-warning" : "bg-secondary text-secondary-foreground")}>
          <Icon className="size-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 id="sts-title" className="text-[0.9375rem] font-medium text-muted-foreground">Safe to spend</h2>
            <button type="button" onClick={() => setWhy(true)}
              className="hit -mr-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] font-medium text-primary hover:bg-accent">
              <Calculator className="size-3.5" /> Why?
            </button>
          </div>
          <AnimatedMoney minor={sts.amount_minor} className={cn("mt-0.5 block text-[2rem] leading-tight font-extrabold tracking-[-0.02em]", short && "text-expense")} />
          <p className={cn("mt-1 text-sm leading-snug", tight ? "text-warning" : "text-muted-foreground")}>
            {short ? statusSentence(sts) : <>After upcoming bills and planned savings. {statusSentence(sts)}</>}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-border/60 pt-3.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">This week</span>
          <span><span className="tabular font-semibold">{formatMoney(week.left_minor)}</span> <span className="text-muted-foreground">left</span></span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="This week's share used"
          aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full w-full rounded-full transition-transform duration-700 ease-[var(--ease-out-quint)]", used >= 100 ? "bg-warning" : "bg-primary")} style={{ transform: `translateX(${Math.min(100, used) - 100}%)` }} />
        </div>
        {week.plan && (
          <p className="tabular mt-2 text-[0.8125rem] text-muted-foreground">
            <Link href="/plan/money" className="hover:text-foreground">Joy Money {formatMoney(week.plan.joy_left_minor)}, needs {formatMoney(week.plan.needs_left_minor)}</Link>
          </p>
        )}
      </div>

      <SafeToSpendWhy sts={sts} open={why} onOpenChange={setWhy} />
    </section>
  )
}
