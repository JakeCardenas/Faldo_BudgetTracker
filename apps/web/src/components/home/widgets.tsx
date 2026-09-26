"use client"

import Link from "next/link"
import { useState } from "react"
import { format, parseISO } from "date-fns"
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, FileUp, Flag, LineChart, MessageCircle, PieChart, Scale, type LucideIcon } from "lucide-react"
import { MoneyOwedIcon, TINTED } from "@/components/finance/category-icon"
import { Money } from "@/components/finance/money"
import { Section } from "@/components/ios/panel"
import { useAppActions } from "@/components/layout/app-context"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney } from "@/lib/format"
import { PALETTE } from "@/lib/palette"
import { useDashboard } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { CategoryRow, Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"

type QuickAction = { label: string; icon: LucideIcon; tint: string } & ({ href: string } | { action: "check" })

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Budgets", icon: PieChart, tint: PALETTE.gold, href: "/budgets" },
  { label: "Goals", icon: Flag, tint: PALETTE.teal, href: "/goals" },
  { label: "Bills", icon: CalendarClock, tint: PALETTE.blue, href: "/bills" },
  { label: "Money owed", icon: MoneyOwedIcon, tint: PALETTE.apricot, href: "/debts" },
  { label: "Forecast", icon: LineChart, tint: PALETTE.indigo, href: "/forecast" },
  { label: "Check", icon: Scale, tint: PALETTE.green, action: "check" },
  { label: "Import", icon: FileUp, tint: PALETTE.slate, href: "/import" },
  { label: "Ask Faldo", icon: MessageCircle, tint: "var(--primary)", href: "/assistant" },
]

/** A round button on a soft wash of its colour, drawn like the category icons; it dips when pressed. */
const tile = cn("flex size-14 items-center justify-center rounded-full transition-[scale,background-color] duration-200 ease-(--ease-out-quint) group-active:scale-[0.94] [&_svg]:size-[1.375rem] group-hover:bg-[color-mix(in_oklab,var(--cat)_22%,transparent)]", TINTED)

/**
 * Shortcuts to the places people open most: round buttons in a 4 by 2 grid (one row of eight from tablets up),
 * every one in view. They sit right under the balance as its action row, so they need no heading.
 */
export function QuickActions({ className }: { className?: string }) {
  const { openCheck } = useAppActions()
  return (
    <Section className={className}>
      <ul aria-label="Quick actions" className="cascade grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-8">
        {QUICK_ACTIONS.map((q) => {
          const Icon = q.icon
          const body = (
            <>
              <span className={tile} style={{ "--cat": q.tint } as React.CSSProperties}><Icon strokeWidth={2} /></span>
              <span className="mt-1.5 block w-full truncate text-center text-[0.75rem] font-medium text-foreground/70">{q.label}</span>
            </>
          )
          const classes = "group flex flex-col items-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          return (
            <li key={q.label} className="min-w-0">
              {"href" in q ? (
                <Link href={q.href} onClick={() => play("tap")} className={classes}>{body}</Link>
              ) : (
                <button type="button" onClick={() => { play("tap"); openCheck() }} className={cn(classes, "w-full")}>{body}</button>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
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

/** Money in and out for today, this week or this month, each named, not only coloured. */
export function MoneyInOut({ className }: { className?: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[0])
  const { data, isLoading } = useDashboard(period.id)
  const overview = data?.period.name === period.id ? data.overview : undefined
  return (
    <section aria-label="Money in and out" className={cn("card-surface flex min-w-0 flex-col rounded-[1.5rem] p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">{period.title}</h2>
        <div className="flex rounded-full bg-muted p-0.5" role="radiogroup" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={p.id === period.id}
              onClick={() => { play("select"); setPeriod(p) }}
              className={cn("hit h-7 rounded-full px-2.5 text-[0.75rem] font-semibold transition-[background-color,color,box-shadow] duration-200",
                p.id === period.id ? "bg-card text-foreground shadow-[0_1px_2px_rgb(16_36_24/0.1)] dark:bg-accent" : "text-muted-foreground hover:text-foreground")}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-3 pt-4">
        {([["Money in", overview?.income_minor, ArrowDownLeft, "text-income"], ["Money out", overview?.expense_minor, ArrowUpRight, "text-foreground"]] as const).map(([label, value, Icon, tone]) => (
          <div key={label} className="min-w-0">
            <dt className="flex items-center gap-1 text-[0.75rem] text-muted-foreground">
              <Icon className={cn("size-3.5", label === "Money in" ? "text-income" : "text-muted-foreground")} strokeWidth={2.2} aria-hidden />{label}
            </dt>
            <dd className="mt-1">
              {isLoading && !overview ? <Skeleton className="h-6 w-20" />
                : <Money key={period.id} minor={value ?? 0} className={cn("block truncate font-money text-[1.375rem] leading-tight font-extrabold tracking-[-0.02em] animate-in fade-in-0 duration-150", (value ?? 0) > 0 && tone)} />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
