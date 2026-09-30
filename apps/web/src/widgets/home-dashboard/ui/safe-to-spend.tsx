"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertTriangle, Calculator, CircleDashed, ShieldCheck } from "lucide-react"
import { CalculationCard } from "@/shared/ui/money/calculation-card"
import { AnimatedMoney } from "@/shared/ui/money/money"
import { IosSheet } from "@/shared/ui/ios/sheet"
import { formatDate, formatMoney } from "@/shared/lib/format"
import type { SafeToSpend } from "@/shared/api/types"
import { cn } from "@/shared/lib/utils"
import { fitSize } from "./widgets"

export function untilPhrase(sts: SafeToSpend) {
  if (sts.period === "until_income" && sts.next_income_on) {
    return `until ${sts.next_income_label ?? "your next income"} on ${formatDate(sts.next_income_on, "MMM d")}`
  }
  return "for the next 30 days"
}

/** One short line for the card: why the number is what it is, sized for half a phone's width. */
function statusLine(sts: SafeToSpend) {
  if (sts.status === "short") {
    return `${formatMoney(sts.shortfall_minor)} short ${sts.period === "until_income" && sts.next_income_on ? `before ${formatDate(sts.next_income_on, "MMM d")}` : "this month"}`
  }
  if (sts.status === "tight") return "This week's share is used"
  return `About ${formatMoney(sts.per_day_minor)} a day ${untilPhrase(sts)}`
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
 * Safe to Spend, the answer to "am I okay right now?": the number, one line on why, and this week's share. Sized to
 * sit beside money in and out. Red only when money is genuinely short, amber when this week's share is used, and
 * each state has its own icon so it never rests on colour alone. Figures come from the engine; Why? shows its lines.
 */
export function SafeToSpendCard({ sts, className }: { sts: SafeToSpend; className?: string }) {
  const [why, setWhy] = useState(false)
  const week = sts.week
  const short = sts.status === "short"
  const tight = sts.status === "tight"
  const used = week.allowance_minor > 0 ? Math.min(100, (week.spent_minor / week.allowance_minor) * 100) : week.spent_minor > 0 ? 100 : 0
  const Icon = short ? AlertTriangle : tight ? CircleDashed : ShieldCheck

  return (
    <section aria-labelledby="sts-title" className={cn("card-surface @container flex min-w-0 flex-col p-4", short && "bg-danger-soft shadow-none", className)}>
      <h2 id="sts-title" className="section-title">Safe to spend</h2>
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <AnimatedMoney minor={sts.amount_minor}
          className={cn("block min-w-0 font-money leading-tight font-extrabold tracking-[-0.025em]", fitSize(formatMoney(sts.amount_minor), ["text-[1.75rem]", "text-[1.375rem]", "text-[1.125rem]"]), short && "text-expense")} />
        <button type="button" onClick={() => setWhy(true)} aria-label="Why this number?"
          className="hit -mr-1.5 inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.75rem] font-semibold text-primary hover:bg-secondary">
          <Calculator className="size-4 @[11.5rem]:size-3.5" /><span className="hidden @[11.5rem]:inline">Why?</span>
        </button>
      </div>
      <p className={cn("mt-1 flex gap-1 text-[0.8125rem] leading-snug", short ? "text-expense" : tight ? "text-warning" : "text-muted-foreground")}>
        <Icon className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} aria-hidden />
        <span className="min-w-0">{statusLine(sts)}</span>
      </p>

      <div className="mt-auto pt-3.5">
        <div className="flex items-baseline justify-between gap-2 text-[0.75rem]">
          <span className="text-muted-foreground">This week</span>
          <span><span className="tabular font-semibold">{formatMoney(week.left_minor)}</span> <span className="text-muted-foreground">left</span></span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chart-track" role="progressbar" aria-label="This week's share used"
          aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn("h-full w-full rounded-full transition-transform duration-700 ease-[var(--ease-out-quint)]", used >= 100 ? "bg-warning" : "bg-primary")} style={{ transform: `translateX(${Math.min(100, used) - 100}%)` }} />
        </div>
        {week.plan && (
          <Link href="/plan/money" className="tabular mt-1.5 block truncate text-[0.75rem] text-muted-foreground hover:text-foreground">
            Joy {formatMoney(week.plan.joy_left_minor)} · needs {formatMoney(week.plan.needs_left_minor)}
          </Link>
        )}
      </div>

      <SafeToSpendWhy sts={sts} open={why} onOpenChange={setWhy} />
    </section>
  )
}
