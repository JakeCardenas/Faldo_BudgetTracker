"use client"

import Link from "next/link"
import { useState } from "react"
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChevronRight, FileUp, Flag, HandCoins, LineChart, MessageCircle, PieChart, Scale, type LucideIcon } from "lucide-react"
import { CategoryIcon } from "@/components/finance/category-icon"
import { Money } from "@/components/finance/money"
import { Section } from "@/components/ios/panel"
import { useAppActions } from "@/components/layout/app-context"
import { Skeleton } from "@/components/ui/skeleton"
import { useDashboard } from "@/lib/queries"
import { play } from "@/lib/sound"
import type { Dashboard } from "@/lib/types"
import { cn } from "@/lib/utils"

type QuickAction = { label: string; icon: LucideIcon } & ({ href: string } | { action: "check" })

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Budgets", icon: PieChart, href: "/budgets" },
  { label: "Goals", icon: Flag, href: "/goals" },
  { label: "Bills", icon: CalendarClock, href: "/bills" },
  { label: "Money owed", icon: HandCoins, href: "/debts" },
  { label: "Forecast", icon: LineChart, href: "/forecast" },
  { label: "Check", icon: Scale, action: "check" },
  { label: "Import", icon: FileUp, href: "/import" },
  { label: "Ask Faldo", icon: MessageCircle, href: "/assistant" },
]

/** A round button that dips on a spring when pressed. */
const tile = "flex size-14 items-center justify-center rounded-full bg-card text-foreground shadow-(--shadow-card) transition-[scale,background-color] duration-300 ease-(--ease-spring) group-hover:bg-accent group-active:scale-[0.88] [&_svg]:size-6"

/**
 * Shortcuts to the places people open most: round buttons in a 4 by 2 grid, every one in view. They sit
 * right under the balance as its action row, so they need no heading.
 */
export function QuickActions({ className }: { className?: string }) {
  const { openCheck } = useAppActions()
  return (
    <Section className={className}>
      <ul aria-label="Quick actions" className="cascade grid grid-cols-4 gap-x-2 gap-y-4 lg:grid-cols-8">
        {QUICK_ACTIONS.map((q) => {
          const Icon = q.icon
          const body = (
            <>
              <span className={tile}><Icon strokeWidth={1.7} /></span>
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

/** A ring of this month's spending by category, with the top three called out. */
export function SpendingRing({ data, className }: { data: Dashboard; className?: string }) {
  const rows = data.spending_by_category
  const top = rows.slice(0, 3)
  const size = 80
  const stroke = 12
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const arcs = rows.map((row, i) => {
    const start = rows.slice(0, i).reduce((sum, x) => sum + (x.pct / 100) * circumference, 0)
    return { row, start, length: (row.pct / 100) * circumference }
  })
  return (
    <section aria-label="Spending this month" className={cn("card-surface flex min-w-0 flex-col p-3.5", className)}>
      {rows.length === 0 ? (
        <p className="m-auto py-6 text-center text-[0.8125rem] text-muted-foreground">No spending logged this month yet.</p>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0" style={{ width: size, height: size }}>
              <svg viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={stroke} />
                {arcs.map(({ row, start, length }) => (
                  <circle key={row.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={row.color} strokeWidth={stroke}
                    strokeDasharray={`${Math.max(0, length - 1.5)} ${circumference}`} strokeDashoffset={-start} />
                ))}
              </svg>
              <span className="tabular absolute inset-0 flex items-center justify-center text-[1.0625rem] font-extrabold tracking-[-0.03em]">
                {Math.round(top[0].pct)}<span className="text-[0.6875rem] font-semibold text-muted-foreground">%</span>
              </span>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {top.map((row) => (
                <li key={row.label} className="flex items-center gap-1.5">
                  <CategoryIcon icon={row.icon} color={row.color} size="sm" className="size-6 [&_svg]:size-3" />
                  <span className="tabular text-[0.75rem] font-bold">{Math.round(row.pct)}%</span>
                  <span className="sr-only">{row.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link href="/reports" className="mt-auto inline-flex items-center justify-center gap-0.5 pt-3 text-[0.75rem] font-semibold text-primary hover:opacity-80">
            See breakdown <ChevronRight className="size-3.5" />
          </Link>
        </>
      )}
    </section>
  )
}

const PERIODS = [
  { id: "today", label: "Day", title: "Today" },
  { id: "this_week", label: "Week", title: "This week" },
  { id: "this_month", label: "Month", title: "This month" },
] as const

/** Money in and out for today, this week or this month. */
export function MoneyInOut({ className }: { className?: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(PERIODS[0])
  const { data, isLoading } = useDashboard(period.id)
  const overview = data?.period.name === period.id ? data.overview : undefined
  return (
    <section aria-label="Money in and out" className={cn("card-surface flex min-w-0 flex-col p-3.5", className)}>
      <h2 className="text-[1.0625rem] font-bold tracking-[-0.02em]">{period.title}</h2>
      <div className="mt-2 mb-3 space-y-1">
        {isLoading && !overview ? (
          <><Skeleton className="h-5 w-20" /><Skeleton className="h-6 w-28" /></>
        ) : (
          <>
            <p className="flex items-center gap-1.5">
              <ArrowUpRight className="size-3.5 shrink-0 text-income" strokeWidth={2.4} aria-label="In" />
              <Money minor={overview?.income_minor ?? 0} className="truncate text-[0.9375rem] font-bold text-income" />
            </p>
            <p className="flex items-center gap-1.5">
              <ArrowDownRight className="size-3.5 shrink-0 text-expense" strokeWidth={2.4} aria-label="Out" />
              <Money minor={overview?.expense_minor ?? 0} className="truncate text-[1.1875rem] font-extrabold tracking-[-0.03em]" />
            </p>
          </>
        )}
      </div>
      <div className="mt-auto flex gap-0.5" role="radiogroup" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={p.id === period.id}
            onClick={() => { play("select"); setPeriod(p) }}
            className={cn("pressable hit h-7 flex-1 rounded-full text-[0.6875rem] font-semibold transition-colors duration-200",
              p.id === period.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {p.label}
          </button>
        ))}
      </div>
    </section>
  )
}
