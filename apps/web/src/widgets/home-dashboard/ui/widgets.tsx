"use client"

import Link from "next/link"
import { useState } from "react"
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

function changeText(pct: number | null) {
  if (pct === null) return "So far this month"
  if (Math.round(pct) === 0) return "About the same as this time last month"
  return `${Math.abs(Math.round(pct))}% ${pct > 0 ? "more" : "less"} than this time last month`
}

/**
 * This month's spending, answering one question: where did it go? The total, then one labelled bar per category
 * (the four biggest, and Other only when there are more), each bar measured against the biggest so they compare at
 * a glance, with the amount and share written beside it. The colour dot names the category too; the label carries
 * the meaning. The week-by-day view lives on Statistics.
 */
export function SpendingCard({ data, className }: { data: Dashboard; className?: string }) {
  const rows = slices(data.spending_by_category)
  const total = data.overview.expense_minor
  const largest = Math.max(1, ...rows.map((r) => r.amount_minor))
  return (
    <section aria-labelledby="spending-title" className={cn("card-surface min-w-0 p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="spending-title" className="section-title">Spent this month</h2>
        <Link href="/reports" className="hit inline-flex items-center gap-0.5 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
          Statistics <ChevronRight className="size-3.5" />
        </Link>
      </div>
      <Money minor={total} className="display-number mt-2 block" />
      <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{changeText(data.overview.expense_change_pct)}</p>

      {rows.length === 0 ? (
        <p className="mt-4 text-[0.875rem] text-muted-foreground">Nothing spent yet this month. What you log shows up here by category.</p>
      ) : (
        <ul className="mt-4 space-y-3.5" aria-label="Spending by category">
          {rows.map((row) => (
            <li key={row.label} className="min-w-0">
              <div className="flex items-baseline gap-2 text-[0.875rem]">
                <span aria-hidden className="size-2.5 shrink-0 translate-y-[-0.0625rem] rounded-full" style={{ backgroundColor: row.color }} />
                <span className="min-w-0 flex-1 truncate font-medium">{row.label}</span>
                <Money minor={row.amount_minor} compact={row.amount_minor >= 10_000_000} className="font-semibold" />
                <span className="tabular w-9 shrink-0 text-right text-[0.8125rem] text-muted-foreground">{Math.round(row.pct)}%</span>
              </div>
              <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-chart-track">
                <div className="h-full rounded-full" style={{ width: `${Math.max(2, (row.amount_minor / largest) * 100)}%`, backgroundColor: row.color }} />
              </div>
            </li>
          ))}
        </ul>
      )}
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
