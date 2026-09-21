"use client"

import { useState } from "react"
import { ChevronDown, Minus, Scale } from "lucide-react"
import { CalculationCard } from "@/components/finance/calculation-card"
import { AnimatedMoney } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { useAppActions } from "@/components/layout/app-context"
import { Button } from "@/components/ui/button"
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
  return `You're good for now. About ${formatMoney(sts.per_day_minor)} a day ${until}.`
}

export function SafeToSpendHero({ sts, className }: { sts: SafeToSpend; className?: string }) {
  const { openCheck, openAddTransaction } = useAppActions()
  const [why, setWhy] = useState(false)
  const week = sts.week
  const weekUsed = week.allowance_minor > 0 ? (week.spent_minor / week.allowance_minor) * 100 : week.spent_minor > 0 ? 100 : 0

  return (
    <section className={cn("card-surface", className)} aria-labelledby="sts-title">
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <p id="sts-title" className="text-[0.8125rem] font-medium text-muted-foreground">Safe to spend</p>
        <AnimatedMoney minor={sts.amount_minor} className={cn("display-number mt-1 block sm:text-[3rem]", sts.status === "short" && "text-expense")} />
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted-foreground">{statusSentence(sts)}</p>
      </div>

      <div className="mt-5 border-t px-4 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm">
            <span className="tabular font-semibold">{formatMoney(week.left_minor)}</span>
            <span className="text-muted-foreground"> left for this week</span>
          </p>
          <p className="tabular text-xs text-muted-foreground">
            {formatMoney(week.spent_minor)} of {formatMoney(week.allowance_minor)} used
          </p>
        </div>
        <ProgressBar className="mt-2" value={weekUsed} status={weekUsed >= 100 ? "over" : weekUsed >= 85 ? "near_limit" : "on_track"}
          label="This week's spending used" />
        <p className="mt-1.5 text-xs text-muted-foreground">
          {formatDate(week.start, "EEE MMM d")} to {formatDate(week.end, "EEE MMM d")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-6">
        <Button onClick={() => openCheck()}><Scale /> Check a purchase</Button>
        <Button variant="outline" onClick={() => openAddTransaction({ mode: "expense" })}><Minus /> Log expense</Button>
        <button type="button" onClick={() => setWhy((v) => !v)} aria-expanded={why} aria-controls="sts-why"
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[0.8125rem] font-medium text-primary hover:opacity-80">
          Why this number? <ChevronDown className={cn("size-3.5 transition-transform", why && "rotate-180")} />
        </button>
      </div>
      {why && (
        <div id="sts-why" className="px-4 pb-4 sm:px-6 sm:pb-6">
          <CalculationCard title={`Safe to spend ${untilPhrase(sts)}`} lines={sts.lines} resultLabel="Safe to spend" resultMinor={sts.raw_minor} note={sts.note} />
        </div>
      )}
    </section>
  )
}
