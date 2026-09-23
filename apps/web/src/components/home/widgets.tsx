"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, FileUp, Flag, LineChart, MessageCircle, PieChart, Scale, type LucideIcon } from "lucide-react"
import { MoneyOwedIcon, TINTED } from "@/components/finance/category-icon"
import { Money } from "@/components/finance/money"
import { Section } from "@/components/ios/panel"
import { useAppActions } from "@/components/layout/app-context"
import { Skeleton } from "@/components/ui/skeleton"
import { PALETTE } from "@/lib/palette"
import { useDashboard } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Dashboard } from "@/lib/types"
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

/** This month's spending as a ring, with the total in the middle and the top categories named beside it. */
export function SpendingRing({ data, className }: { data: Dashboard; className?: string }) {
  const rows = data.spending_by_category
  const top = rows.slice(0, 3)
  const total = data.overview.expense_minor
  const size = 96
  const stroke = 11
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const arcs = rows.map((row, i) => {
    const start = rows.slice(0, i).reduce((sum, x) => sum + (x.pct / 100) * circumference, 0)
    return { row, start, length: (row.pct / 100) * circumference }
  })
  return (
    <section aria-label="Spending this month" className={cn("card-surface flex min-w-0 flex-col p-4", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">This month</h2>
        {rows.length > 0 && (
          <Link href="/reports" className="hit inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
            Breakdown <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="my-auto py-6 text-[0.875rem] text-muted-foreground">Nothing spent yet this month. What you log shows up here by category.</p>
      ) : (
        <div className="mt-3 flex items-center gap-4">
          <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
              {arcs.map(({ row, start, length }) => (
                <circle key={row.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={row.color} strokeWidth={stroke} strokeLinecap="butt"
                  strokeDasharray={`${Math.max(0, length - 2)} ${circumference}`} strokeDashoffset={-start} />
              ))}
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
              <span className="text-[0.6875rem] text-muted-foreground">Spent</span>
              <Money minor={total} compact={total >= 10_000_000} className="mt-1 text-[0.875rem] font-bold tracking-[-0.02em]" />
            </span>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {top.map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-[0.8125rem]">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <span className="tabular shrink-0 font-semibold">{Math.round(row.pct)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
    <section aria-label="Money in and out" className={cn("card-surface flex min-w-0 flex-col p-4", className)}>
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
                : <Money key={period.id} minor={value ?? 0} className={cn("block truncate text-[1.1875rem] font-bold tracking-[-0.03em] animate-in fade-in-0 duration-150", (value ?? 0) > 0 && tone)} />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
