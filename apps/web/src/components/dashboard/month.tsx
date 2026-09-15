"use client"

import Link from "next/link"
import { useMemo } from "react"
import { eachDayOfInterval, format, parseISO, subDays } from "date-fns"
import { ArrowDownLeft, ArrowRight, ArrowUpRight, PiggyBank } from "lucide-react"
import { Money } from "@/components/finance/money"
import { Delta } from "@/components/finance/stat"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney, formatPct, todayISO } from "@/lib/format"
import { useTransactions } from "@/lib/queries"
import type { Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"

const RING = 2 * Math.PI * 42

export function SpendingRing({ data }: { data: Dashboard }) {
  const rows = data.spending_by_category.slice(0, 4)
  const total = data.overview.expense_minor
  const budgeted = data.budget.total_budgeted_minor
  const usedPct = budgeted > 0 && data.period.name === "this_month" ? Math.round((data.budget.total_spent_minor / budgeted) * 100) : null
  const lengths = data.spending_by_category.map((row) => (total > 0 ? (row.amount_minor / total) * RING : 0))
  const segments = data.spending_by_category.map((row, i) => ({
    color: row.color,
    dash: `${Math.max(0, lengths[i] - 1.2)} ${RING}`,
    offset: -lengths.slice(0, i).reduce((sum, length) => sum + length, 0),
  }))

  return (
    <section className="card-surface flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.95rem] font-bold tracking-tight">Where it went</h2>
        <span className="text-xs text-muted-foreground">{data.period.label}</span>
      </div>
      <div className="mt-4 flex flex-1 items-center gap-5">
        <div className="relative size-32 shrink-0">
          <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--muted)" strokeWidth="11" />
            {segments.map((s, i) => (
              <circle key={i} cx="50" cy="50" r="42" fill="none" stroke={s.color} strokeWidth="11"
                strokeDasharray={s.dash} strokeDashoffset={s.offset} className="transition-all duration-700" />
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {usedPct !== null ? (
              <>
                <span className={cn("tabular text-2xl font-extrabold tracking-tight", usedPct > 100 && "text-destructive")}>{usedPct}%</span>
                <span className="text-[0.65rem] font-medium text-muted-foreground">of budget</span>
              </>
            ) : (
              <>
                <span className="tabular text-base font-extrabold tracking-tight">{formatMoney(total, "PHP", { compact: true })}</span>
                <span className="text-[0.65rem] font-medium text-muted-foreground">spent</span>
              </>
            )}
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2">
          {rows.length === 0 && <li className="text-sm text-muted-foreground">No spending yet in this period.</li>}
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="min-w-0 flex-1 truncate">{row.label}</span>
              <span className="tabular text-xs font-semibold text-muted-foreground">{formatPct(row.pct)}</span>
            </li>
          ))}
        </ul>
      </div>
      <Link href="/reports" className="mt-4 inline-flex items-center gap-1 self-start text-xs font-semibold text-primary hover:underline">
        See the full breakdown <ArrowRight className="size-3" />
      </Link>
    </section>
  )
}

export function ThisPeriod({ data }: { data: Dashboard }) {
  const o = data.overview
  const rows = [
    { label: "Money in", minor: o.income_minor, icon: ArrowDownLeft, tone: "bg-mint text-mint-foreground", delta: <Delta pct={o.income_change_pct} goodWhen="up" suffix="" /> },
    { label: "Money out", minor: o.expense_minor, icon: ArrowUpRight, tone: "bg-[#fdebe7] text-[#c0492b]", delta: <Delta pct={o.expense_change_pct} goodWhen="down" suffix="" /> },
    { label: "Saved", minor: o.saved_minor, icon: PiggyBank, tone: "bg-secondary text-primary", delta: <span className="text-xs text-muted-foreground">{o.savings_rate !== null ? `${formatPct(o.savings_rate)} of income` : "—"}</span> },
  ]
  return (
    <section className="card-surface flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.95rem] font-bold tracking-tight">Cash flow</h2>
        <span className="text-xs text-muted-foreground">vs {data.previous_period.label}</span>
      </div>
      <ul className="mt-4 flex flex-1 flex-col justify-between gap-3">
        {rows.map((row) => {
          const Icon = row.icon
          return (
            <li key={row.label} className="flex items-center gap-3">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl", row.tone)}><Icon className="size-[1.1rem]" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{row.label}</p>
                <Money minor={row.minor} className={cn("text-lg font-bold tracking-tight", row.minor < 0 && "text-destructive")} />
              </div>
              {row.delta}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function WeekBars() {
  const today = todayISO()
  const from = format(subDays(parseISO(today), 6), "yyyy-MM-dd")
  const { data, isLoading } = useTransactions({ type: ["expense"], date_from: from, date_to: today, limit: 100 })
  const days = useMemo(() => {
    const totals = new Map<string, number>()
    for (const t of data?.items ?? []) totals.set(t.occurred_on, (totals.get(t.occurred_on) ?? 0) + t.amount_minor)
    return eachDayOfInterval({ start: parseISO(from), end: parseISO(today) }).map((d) => {
      const key = format(d, "yyyy-MM-dd")
      return { key, label: format(d, "EEEEE"), amount: totals.get(key) ?? 0, isToday: key === today }
    })
  }, [data, from, today])
  const max = Math.max(1, ...days.map((d) => d.amount))
  const week = days.reduce((s, d) => s + d.amount, 0)

  return (
    <section className="card-surface flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.95rem] font-bold tracking-tight">Last 7 days</h2>
        <Money minor={week} className="text-xs font-semibold text-muted-foreground" />
      </div>
      {isLoading ? <Skeleton className="mt-4 h-32 flex-1 rounded-2xl" /> : (
        <div className="mt-4 flex flex-1 items-end gap-2" role="img"
          aria-label={`Daily spending for the last 7 days, ${formatMoney(week)} total`}>
          {days.map((d) => (
            <div key={d.key} className="flex h-full min-h-32 flex-1 flex-col items-center justify-end gap-2" title={`${format(parseISO(d.key), "EEE, MMM d")}: ${formatMoney(d.amount)}`}>
              <div className="flex w-full flex-1 items-end justify-center rounded-full bg-muted/70">
                <div className={cn("w-full rounded-full transition-[height] duration-700", d.isToday ? "bg-primary" : "bg-leaf/70")}
                  style={{ height: `${Math.max(8, (d.amount / max) * 100)}%` }} />
              </div>
              <span className={cn("text-[0.7rem] font-semibold", d.isToday ? "text-primary" : "text-muted-foreground")}>{d.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
