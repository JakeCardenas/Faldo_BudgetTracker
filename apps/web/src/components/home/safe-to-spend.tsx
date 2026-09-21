"use client"

import Link from "next/link"
import { useState } from "react"
import { Calculator, Scale } from "lucide-react"
import { CalculationCard } from "@/components/finance/calculation-card"
import { AnimatedMoney } from "@/components/finance/money"
import { IosSheet } from "@/components/ios/sheet"
import { useAppActions } from "@/components/layout/app-context"
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
 * Faldo's signature number. Deep green when there's room, deep red when money is short.
 * Every figure comes from the backend engine; this component only lays it out.
 */
export function SafeToSpendCard({ sts, className }: { sts: SafeToSpend; className?: string }) {
  const { openCheck } = useAppActions()
  const [why, setWhy] = useState(false)
  const week = sts.week
  const short = sts.status === "short"
  const used = week.allowance_minor > 0 ? Math.min(100, (week.spent_minor / week.allowance_minor) * 100) : week.spent_minor > 0 ? 100 : 0

  return (
    <section aria-labelledby="sts-title"
      className={cn("relative isolate overflow-hidden rounded-3xl p-5 text-white sm:p-6", className)}
      style={{
        backgroundImage: [
          "radial-gradient(110% 90% at 100% 0%, rgb(255 255 255 / 0.13), transparent 50%)",
          "radial-gradient(70% 60% at 0% 110%, rgb(0 0 0 / 0.22), transparent 70%)",
          short ? "linear-gradient(150deg, #8a3129, #3f1612)" : "linear-gradient(150deg, var(--hero), var(--hero-deep))",
        ].join(","),
        boxShadow: short
          ? "0 24px 44px -26px rgb(90 24 18 / 0.75), inset 0 1px 0 rgb(255 255 255 / 0.14)"
          : "0 24px 44px -26px color-mix(in oklab, var(--hero) 85%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.14)",
      }}>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] md:items-end md:gap-8">
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 id="sts-title" className="text-[0.9375rem] font-medium text-white/90">Safe to spend</h2>
            <button type="button" onClick={() => setWhy(true)}
              className="-mr-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] font-medium text-white/90 transition-colors hover:bg-white/12 md:hidden">
              <Calculator className="size-3.5" /> Why this number?
            </button>
          </div>
          <AnimatedMoney minor={sts.amount_minor} className="display-xl mt-2 block text-white sm:text-[3.25rem]" symbolClassName="text-white/70" />
          <p className="mt-2.5 max-w-[34ch] text-[0.9375rem] leading-snug text-white/90">{statusSentence(sts)}</p>
        </div>

        <div className="min-w-0 border-t border-white/15 pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[0.875rem] text-white/85">This week</p>
            <p className="text-[0.9375rem]"><span className="tabular font-semibold">{formatMoney(week.left_minor)}</span> <span className="text-white/85">left</span></p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-label="This week's share used"
            aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn("h-full rounded-full transition-[width] duration-700 ease-[var(--ease-out-quint)]", used >= 100 ? "bg-[#ffc98f]" : "bg-white")} style={{ width: `${used}%` }} />
          </div>
          <p className="tabular mt-2 text-[0.8125rem] text-white/80">
            {week.plan ? (
              <Link href="/plan/money" className="hover:text-white">
                Joy Money {formatMoney(week.plan.joy_left_minor)}, needs {formatMoney(week.plan.needs_left_minor)}
              </Link>
            ) : (
              <>{formatMoney(week.spent_minor)} of {formatMoney(week.allowance_minor)} used, {formatDate(week.start, "EEE")} to {formatDate(week.end, "EEE")}</>
            )}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => openCheck()}
          className="pressable inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-[#143a25] shadow-[0_6px_16px_-8px_rgb(0_0_0/0.45)] hover:bg-white/92">
          <Scale className="size-4" /> Can I afford it?
        </button>
        <button type="button" onClick={() => setWhy(true)}
          className="hidden h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/12 md:inline-flex">
          <Calculator className="size-4" /> Why this number?
        </button>
      </div>
      <SafeToSpendWhy sts={sts} open={why} onOpenChange={setWhy} />
    </section>
  )
}
