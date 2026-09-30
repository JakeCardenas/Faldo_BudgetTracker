"use client"

import Link from "next/link"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Ellipsis, Flag, PieChart, Plus, Scale, type LucideIcon } from "lucide-react"
import { Money } from "@/shared/ui/money/money"
import { Segmented } from "@/shared/ui/ios/segmented"
import { useAppActions } from "@/shared/lib/app-actions"
import { Skeleton } from "@/shared/ui/skeleton"
import { formatMoney } from "@/shared/lib/format"
import { PALETTE } from "@/shared/lib/palette"
import { useDashboard } from "@/entities/dashboard"
import { play } from "@/shared/lib/sound"
import type { CategoryRow, Dashboard } from "@/shared/api/types"
import { cn } from "@/shared/lib/utils"
import { MoreSheet } from "./more-sheet"

type QuickAction = { label: string; icon: LucideIcon } & ({ href: string } | { action: "add" | "check" | "more" })

/**
 * Five, not a second tab bar: record money first, then deciding on a purchase, the two plans people check most, and
 * More for everything else. Bills are on Home already (Payments due); Faldo is his note above.
 */
const QUICK_ACTIONS: QuickAction[] = [
  { label: "Add", icon: Plus, action: "add" },
  { label: "Check", icon: Scale, action: "check" },
  { label: "Budgets", icon: PieChart, href: "/budgets" },
  { label: "Goals", icon: Flag, href: "/goals" },
  { label: "More", icon: Ellipsis, action: "more" },
]

/** Quick actions: square sage tiles with Faldo's green icons, named underneath. Add, the everyday one, is solid. */
export function QuickActions({ className }: { className?: string }) {
  const { openAddTransaction, openCheck } = useAppActions()
  const [more, setMore] = useState(false)
  const run = (action: "add" | "check" | "more") => {
    play("tap")
    if (action === "add") openAddTransaction({ mode: "expense" })
    else if (action === "check") openCheck()
    else setMore(true)
  }
  return (
    <section aria-labelledby="quick-title" className={cn("card-surface px-2.5 pt-4 pb-3", className)}>
      <h2 id="quick-title" className="section-title px-1.5">Quick actions</h2>
      <ul className="cascade mt-3 grid grid-cols-5 gap-1">
        {QUICK_ACTIONS.map((q) => {
          const Icon = q.icon
          const lead = "action" in q && q.action === "add"
          const body = (
            <>
              <span className={cn("flex size-12 items-center justify-center rounded-[0.875rem] transition-[scale,background-color] duration-200 ease-(--ease-out-quint) group-active:scale-[0.94] [&_svg]:size-[1.3rem]",
                lead ? "bg-primary text-primary-foreground" : "bg-secondary text-primary group-hover:bg-mint")}>
                <Icon strokeWidth={2} />
              </span>
              <span className="mt-1.5 block w-full truncate text-center text-[0.75rem] font-medium text-muted-foreground">{q.label}</span>
            </>
          )
          const classes = "group flex w-full flex-col items-center rounded-[0.875rem] py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          return (
            <li key={q.label} className="min-w-0">
              {"href" in q
                ? <Link href={q.href} onClick={() => play("tap")} className={classes}>{body}</Link>
                : <button type="button" onClick={() => run(q.action)} aria-haspopup="dialog" className={classes}>{body}</button>}
            </li>
          )
        })}
      </ul>
      <MoreSheet open={more} onOpenChange={setMore} />
    </section>
  )
}

type Slice = { label: string; amount_minor: number; pct: number; color: string }

/** The four biggest categories, with the rest folded into Other, so the ring and its legend always agree. */
function slices(rows: CategoryRow[]): Slice[] {
  if (rows.length <= 5) return rows
  const rest = rows.slice(4)
  return [...rows.slice(0, 4), {
    label: "Other", color: PALETTE.stone,
    amount_minor: rest.reduce((sum, r) => sum + r.amount_minor, 0), pct: rest.reduce((sum, r) => sum + r.pct, 0),
  }]
}

/** The ring: each category an arc with a hairline gap; pointing at one (or its legend row) quiets the others. */
function CategoryRing({ data, focus, onFocus }: { data: Slice[]; focus: string | null; onFocus: (label: string | null) => void }) {
  const size = 124
  const stroke = 15
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const gap = data.length > 1 ? 2.5 : 0
  const lengths = data.map((slice) => (slice.pct / 100) * circumference)
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((sum, l) => sum + l, 0))
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="shrink-0 -rotate-90" aria-hidden onPointerLeave={() => onFocus(null)}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={stroke} />
      {data.map((slice, i) => (
        <circle key={slice.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={slice.color} strokeWidth={stroke}
          strokeDasharray={`${Math.max(0.5, lengths[i] - gap)} ${circumference}`} strokeDashoffset={-starts[i]}
          onPointerEnter={() => onFocus(slice.label)}
          className="transition-opacity duration-200" opacity={focus && focus !== slice.label ? 0.3 : 1} />
      ))}
    </svg>
  )
}

/** Spending per day for the last seven days on quiet tracks. Point at or tap a day to read it; today is the bright bar. */
function WeekBars({ days }: { days: { date: string; amount_minor: number }[] }) {
  const [picked, setPicked] = useState<number | null>(null)
  const max = Math.max(1, ...days.map((d) => d.amount_minor))
  const total = days.reduce((sum, d) => sum + d.amount_minor, 0)
  const day = picked !== null ? days[picked] : null
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
        <span className="font-semibold">{day ? format(parseISO(day.date), "EEEE, MMM d") : "Last 7 days"}</span>
        <Money minor={day ? day.amount_minor : total} className="font-bold" />
      </div>
      <ol className="mt-3 grid grid-cols-7 gap-2" onPointerLeave={(e) => { if (e.pointerType === "mouse") setPicked(null) }}>
        {days.map((d, i) => {
          const isToday = i === days.length - 1
          const on = picked === i || (picked === null && isToday)
          return (
            <li key={d.date} className="min-w-0">
              <button type="button" aria-label={`${format(parseISO(d.date), "EEEE, MMMM d")}: ${formatMoney(d.amount_minor)}`} aria-pressed={picked === i}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") setPicked(i) }}
                onClick={() => setPicked(picked === i ? null : i)} onFocus={(e) => { if (e.currentTarget.matches(":focus-visible")) setPicked(i) }} onBlur={() => setPicked(null)}
                className="group flex w-full flex-col items-center gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
                <span className="flex h-14 w-full items-end overflow-hidden rounded-[0.375rem] bg-chart-track">
                  <span className={cn("w-full rounded-[0.375rem] transition-[background-color] duration-200", on ? "bg-primary" : "bg-chart-2")}
                    style={{ height: d.amount_minor > 0 ? `max(0.25rem, ${(d.amount_minor / max) * 100}%)` : 0 }} />
                </span>
                <span className={cn("text-[0.6875rem] leading-none", isToday ? "font-bold text-foreground" : "font-medium text-muted-foreground")}>
                  {format(parseISO(d.date), "EEEEE")}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function changeText(pct: number | null) {
  if (pct === null) return "So far this month"
  if (Math.round(pct) === 0) return "About the same as this time last month"
  return `${Math.abs(Math.round(pct))}% ${pct > 0 ? "more" : "less"} than this time last month`
}

/**
 * This month's spending: the total first, then where it went (a ring with a legend that names every slice)
 * and the last seven days as bars. On wide cards the ring and the week sit side by side.
 */
export function SpendingCard({ data, className }: { data: Dashboard; className?: string }) {
  const [focus, setFocus] = useState<string | null>(null)
  const rows = slices(data.spending_by_category)
  const total = data.overview.expense_minor
  return (
    <section aria-labelledby="spending-title" className={cn("card-surface @container min-w-0 rounded-[1.5rem] p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="spending-title" className="label-caps">Spent this month</h2>
        {rows.length > 0 && (
          <Link href="/reports" className="hit inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
            Breakdown <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>
      <Money minor={total} className="display-number mt-2 block" />
      <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{changeText(data.overview.expense_change_pct)}</p>

      <div className="mt-5 grid gap-6 @[40rem]:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] @[40rem]:items-center @[40rem]:gap-10">
        {rows.length === 0 ? (
          <p className="text-[0.875rem] text-muted-foreground">Nothing spent yet this month. What you log shows up here by category.</p>
        ) : (
          <div className="flex items-center gap-5">
            <CategoryRing data={rows} focus={focus} onFocus={setFocus} />
            <ul className="min-w-0 flex-1 space-y-2.5" aria-label="Spending by category" onPointerLeave={() => setFocus(null)}>
              {rows.map((row) => (
                <li key={row.label} onPointerEnter={() => setFocus(row.label)}
                  className={cn("flex items-center gap-2 text-[0.8125rem] transition-opacity duration-200", focus && focus !== row.label && "opacity-45")}>
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                  <Money minor={row.amount_minor} compact={row.amount_minor >= 10_000_000} className="hidden text-muted-foreground @[40rem]:inline" />
                  <span className="tabular w-10 shrink-0 text-right font-semibold">{Math.round(row.pct)}%</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {data.last_7_days && data.last_7_days.length > 0 && <WeekBars days={data.last_7_days} />}
      </div>
    </section>
  )
}

const PERIODS = [
  { id: "today", label: "Day", title: "Today" },
  { id: "this_week", label: "Week", title: "This week" },
  { id: "this_month", label: "Month", title: "This month" },
] as const

type PeriodId = (typeof PERIODS)[number]["id"]

/** Long amounts step down a size so they always fit a half-width card. */
export function fitSize(text: string, sizes: [string, string, string]) {
  return text.length <= 8 ? sizes[0] : text.length <= 11 ? sizes[1] : sizes[2]
}

/**
 * Money in and out for today, this week or this month: the two amounts stacked, each named, not only coloured,
 * and the period switch at the foot. Sized to sit beside Safe to Spend.
 */
export function MoneyInOut({ className }: { className?: string }) {
  const [periodId, setPeriodId] = useState<PeriodId>("this_month")
  const period = PERIODS.find((p) => p.id === periodId)!
  const { data, isLoading } = useDashboard(period.id)
  const overview = data?.period.name === period.id ? data.overview : undefined
  const rows = [
    { label: "Money in", value: overview?.income_minor, Icon: ArrowDownLeft, tone: "text-income" },
    { label: "Money out", value: overview?.expense_minor, Icon: ArrowUpRight, tone: "text-expense" },
  ] as const
  return (
    <section aria-labelledby="flow-title" className={cn("card-surface flex min-w-0 flex-col p-4", className)}>
      <h2 id="flow-title" className="section-title">{period.title}</h2>
      <dl className="mt-2.5 space-y-2.5">
        {rows.map(({ label, value, Icon, tone }) => (
          <div key={label} className="min-w-0">
            <dt className="flex items-center gap-1 text-[0.75rem] text-muted-foreground">
              <Icon className={cn("size-3.5", tone)} strokeWidth={2.2} aria-hidden />{label}
            </dt>
            <dd>
              {isLoading && !overview ? <Skeleton className="mt-1 h-5 w-20" />
                : <Money key={period.id} minor={value ?? 0}
                  className={cn("block font-money leading-tight font-extrabold tracking-[-0.02em] animate-in fade-in-0 duration-150",
                    fitSize(formatMoney(value ?? 0), ["text-[1.25rem]", "text-[1.0625rem]", "text-[0.9375rem]"]), (value ?? 0) > 0 && tone)} />}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto pt-3.5">
        <Segmented size="xs" label="Period" value={periodId} onChange={setPeriodId} className="flex w-full"
          options={PERIODS.map((p) => ({ value: p.id, label: p.label }))} />
      </div>
    </section>
  )
}
