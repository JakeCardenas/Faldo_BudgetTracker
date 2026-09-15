"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns"
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChevronRight, CreditCard, Loader2, Plus, Wallet, X } from "lucide-react"
import { toast } from "sonner"
import { CategoryIcon } from "@/components/finance/category-icon"
import { AnimatedMoney, Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { Panel } from "@/components/ios/panel"
import { Segmented } from "@/components/ios/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, formatPct, todayISO } from "@/lib/format"
import { GoalIcon } from "@/lib/goal-icons"
import { useBalanceHistory, useNotes, useTransactions, useUpcoming } from "@/lib/queries"
import type { Dashboard, UpcomingItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const RING = 2 * Math.PI * 40

export function Donut({ data, size = "size-28", center, stroke = 11 }: { data: { value: number; color: string }[]; size?: string; center: React.ReactNode; stroke?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const lengths = data.map((d) => (total > 0 ? (d.value / total) * RING : 0))
  return (
    <div className={cn("relative shrink-0", size)}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--muted)" strokeWidth={stroke} />
        {data.map((d, i) => (
          <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={d.color} strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, lengths[i] - (data.length > 1 ? 1.2 : 0))} ${RING}`} strokeDashoffset={-lengths.slice(0, i).reduce((a, b) => a + b, 0)} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{center}</div>
    </div>
  )
}

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return <div className={className} />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const coords = points.map((v, i) => [(i / (points.length - 1)) * 100, max === min ? 20 : 36 - ((v - min) / (max - min)) * 32])
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ")
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={className} aria-hidden>
      <polygon points={`0,40 ${line} 100,40`} fill="var(--primary)" opacity="0.07" />
      <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export function NetWorthCard({ data, className }: { data: Dashboard; className?: string }) {
  const { data: history } = useBalanceHistory(30)
  const { data: upcoming = [] } = useUpcoming(45)
  const first = history?.[0]?.net_minor
  const change = first !== undefined ? data.overview.total_balance_minor - first : null
  const points = history?.map((p) => p.net_minor) ?? []
  const accounts = data.accounts.filter((a) => !a.archived).length
  const payday = upcoming.find((u) => u.is_income)
  const days = payday ? Math.max(0, differenceInCalendarDays(parseISO(payday.due_on), new Date())) : null
  const safe = data.safe_to_spend

  return (
    <section className={cn("card-surface overflow-hidden", className)}>
      <Link href="/accounts" className="group block px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.8125rem] font-medium text-muted-foreground">Net worth</p>
          <span className="flex items-center gap-0.5 text-[0.8125rem] font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 max-lg:hidden">
            Wallet <ChevronRight className="size-3.5" />
          </span>
        </div>
        <AnimatedMoney minor={data.overview.total_balance_minor} className="display-number mt-2 block sm:text-[2.75rem]" />
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[0.8125rem] text-muted-foreground">
          {change !== null && change !== 0 && (
            <span className={cn("inline-flex items-center font-medium", change > 0 ? "text-income" : "text-foreground")}>
              {change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {formatMoney(Math.abs(change), "PHP", { compact: true })}
            </span>
          )}
          {change !== null && change !== 0 && <span>past 30 days</span>}
          <span className="ml-auto">{accounts} account{accounts === 1 ? "" : "s"}</span>
        </p>
        <Sparkline points={points} className="mt-3 -mx-4 h-14 w-[calc(100%+2rem)] sm:-mx-5 sm:h-20 sm:w-[calc(100%+2.5rem)]" />
      </Link>
      <div className="grid grid-cols-2 divide-x border-t">
        <div className="min-w-0 px-4 py-3 sm:px-5">
          <p className="text-[0.8125rem] text-muted-foreground">Safe to spend</p>
          <Money minor={safe.amount_minor} className={cn("mt-0.5 block text-[1.0625rem] font-semibold tracking-[-0.01em]", safe.amount_minor <= 0 && "text-expense")} />
          <p className="tabular truncate text-xs text-muted-foreground">About {formatMoney(safe.per_day_minor)} a day</p>
        </div>
        <Link href="/bills" className="min-w-0 px-4 py-3 transition-colors hover:bg-accent/50 sm:px-5">
          <p className="text-[0.8125rem] text-muted-foreground">Next payday</p>
          {payday && days !== null ? (
            <>
              <p className="mt-0.5 text-[1.0625rem] font-semibold tracking-[-0.01em]">{days === 0 ? "Today" : `In ${days} day${days === 1 ? "" : "s"}`}</p>
              <p className="tabular truncate text-xs text-muted-foreground">{formatMoney(payday.amount_minor)} on {formatDate(payday.due_on, "MMM d")}</p>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-[1.0625rem] font-semibold tracking-[-0.01em] text-muted-foreground">Not set</p>
              <p className="truncate text-xs text-primary">Add your salary schedule</p>
            </>
          )}
        </Link>
      </div>
    </section>
  )
}

type Span = "day" | "week" | "month"

export function ActivityCard({ className }: { className?: string }) {
  const [span, setSpan] = useState<Span>("day")
  const today = todayISO()
  const from = span === "day" ? today : format(span === "week" ? startOfWeek(new Date(), { weekStartsOn: 1 }) : startOfMonth(new Date()), "yyyy-MM-dd")
  const { data: totals, isFetching } = useTransactions({ date_from: from, date_to: today, limit: 1 })
  const weekFrom = format(subDays(parseISO(today), 6), "yyyy-MM-dd")
  const { data: week, isLoading } = useTransactions({ type: ["expense"], date_from: weekFrom, date_to: today, limit: 100 })
  const days = useMemo(() => {
    const sums = new Map<string, number>()
    for (const t of week?.items ?? []) sums.set(t.occurred_on, (sums.get(t.occurred_on) ?? 0) + t.amount_minor)
    return eachDayOfInterval({ start: parseISO(weekFrom), end: parseISO(today) }).map((d) => {
      const key = format(d, "yyyy-MM-dd")
      return { key, label: format(d, "EEEEE"), amount: sums.get(key) ?? 0, isToday: key === today }
    })
  }, [week, weekFrom, today])
  const max = Math.max(1, ...days.map((d) => d.amount))
  const weekTotal = days.reduce((s, d) => s + d.amount, 0)

  return (
    <Panel title="Activity" className={className}
      action={<Segmented label="Period" size="sm" value={span} onChange={setSpan}
        options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />}>
      <div className={cn("grid grid-cols-2 gap-3 transition-opacity", isFetching && "opacity-60")}>
        <div>
          <p className="text-[0.8125rem] text-muted-foreground">Spent</p>
          <Money minor={totals?.total_expense_minor ?? 0} className="mt-0.5 block text-xl font-semibold tracking-[-0.02em]" />
        </div>
        <div>
          <p className="text-[0.8125rem] text-muted-foreground">Income</p>
          <Money minor={totals?.total_income_minor ?? 0} className="mt-0.5 block text-xl font-semibold tracking-[-0.02em] text-income" />
        </div>
      </div>
      <div className="mt-5 flex items-baseline justify-between gap-2">
        <p className="text-xs text-muted-foreground">Spending, last 7 days</p>
        <Money minor={weekTotal} className="text-xs font-medium text-muted-foreground" />
      </div>
      {isLoading ? <Skeleton className="mt-2 h-20" /> : (
        <div className="mt-2 flex h-20 items-end gap-2" role="img" aria-label={`Spending over the last 7 days, ${formatMoney(weekTotal)} total`}>
          {days.map((d) => (
            <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${format(parseISO(d.key), "EEE, MMM d")}: ${formatMoney(d.amount)}`}>
              <div className={cn("w-full max-w-6 rounded-[3px] transition-[height] duration-500 ease-[var(--ease-out-quint)]", d.isToday ? "bg-primary" : "bg-foreground/12 dark:bg-foreground/15")}
                style={{ height: `${Math.max(4, (d.amount / max) * 100)}%` }} />
              <span className={cn("text-[0.6875rem]", d.isToday ? "font-semibold text-foreground" : "text-muted-foreground")}>{d.label}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

export function BreakdownCard({ data, className }: { data: Dashboard; className?: string }) {
  const rows = data.spending_by_category
  const top = rows[0]
  return (
    <Panel title="Where it went" href="/reports" linkLabel="Statistics" className={className}>
      {rows.length === 0 ? (
        <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1 text-center">
          <p className="text-sm font-medium">No spending yet</p>
          <p className="text-[0.8125rem] text-muted-foreground">Categories appear as you log expenses.</p>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Donut size="size-24" stroke={12} data={rows.map((r) => ({ value: r.amount_minor, color: r.color }))}
            center={<><span className="tabular text-base leading-none font-semibold">{Math.round(top.pct)}%</span><span className="mt-0.5 max-w-14 truncate text-[0.625rem] text-muted-foreground">{top.label}</span></>} />
          <ul className="min-w-0 flex-1 space-y-2">
            {rows.slice(0, 4).map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-[0.8125rem]">
                <span className="size-2 shrink-0 rounded-[3px]" style={{ backgroundColor: row.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                <span className="tabular text-muted-foreground">{formatPct(row.pct)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}

function dueLabel(item: UpcomingItem) {
  if (item.is_overdue) return "Overdue"
  if (item.days_until_due === 0) return "Today"
  if (item.days_until_due === 1) return "Tomorrow"
  return `In ${item.days_until_due} days`
}

function UpcomingRow({ item }: { item: UpcomingItem }) {
  const urgent = !item.is_income && (item.is_overdue || item.days_until_due <= 3)
  const Icon = item.kind === "loan" ? CreditCard : item.is_income ? Wallet : CalendarClock
  return (
    <li>
      <Link href="/bills" className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60">
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", item.is_income ? "bg-income-soft text-income" : "bg-muted text-muted-foreground")}>
          <Icon className="size-4" strokeWidth={1.85} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem]">{item.name}</span>
          <span className={cn("block text-[0.8125rem]", urgent ? "font-medium text-expense" : "text-muted-foreground")}>
            {dueLabel(item)}, {formatDate(item.due_on, "MMM d")}
          </span>
        </span>
        <Money minor={item.amount_minor} signed={item.is_income} className={cn("text-[0.9375rem] font-medium", item.is_income && "text-income")} />
      </Link>
    </li>
  )
}

export function UpcomingCard({ items, className }: { items: UpcomingItem[]; className?: string }) {
  const sorted = [...items].sort((a, b) => a.days_until_due - b.days_until_due).slice(0, 6)
  return (
    <Panel title="Upcoming" href="/bills" className={className}>
      {sorted.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing due in the next 3 weeks.</p>
      ) : (
        <ul className="space-y-0.5">{sorted.map((i) => <UpcomingRow key={`${i.recurring_payment_id}-${i.due_on}`} item={i} />)}</ul>
      )}
    </Panel>
  )
}

export function BudgetsCard({ data, className }: { data: Dashboard; className?: string }) {
  const lines = [...data.budget.lines].sort((a, b) => b.pct_used - a.pct_used).slice(0, 5)
  return (
    <Panel title="Budgets" href="/budgets" linkLabel="Manage" className={className}>
      {lines.length === 0 ? (
        <Link href="/budgets" className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <Plus className="size-4" /> Set your first monthly budget
        </Link>
      ) : (
        <ul className="space-y-4">
          {lines.map((line) => (
            <li key={line.id}>
              <div className="flex items-center gap-2.5">
                <CategoryIcon icon={line.category_icon} color={line.category_color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[0.9375rem]">{line.category_name}</span>
                <span className="tabular text-[0.8125rem] text-muted-foreground">
                  <span className="font-medium text-foreground">{formatMoney(line.spent_minor)}</span> of {formatMoney(line.limit_minor)}
                </span>
              </div>
              <ProgressBar className="mt-2" value={line.pct_used} status={line.status} label={`${line.category_name} budget used`} />
              <p className={cn("mt-1.5 text-xs text-muted-foreground", line.status === "over" && "font-medium text-expense")}>
                {line.remaining_minor >= 0 ? `${formatMoney(line.remaining_minor)} left this month` : `${formatMoney(-line.remaining_minor)} over budget`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function GoalsCard({ data, className }: { data: Dashboard; className?: string }) {
  const saved = data.goals.reduce((s, g) => s + g.saved_minor, 0)
  const target = data.goals.reduce((s, g) => s + g.target_minor, 0)
  return (
    <Panel title="Goals" href="/goals" className={className}>
      {data.goals.length === 0 ? (
        <Link href="/goals" className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-6 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <Plus className="size-4" /> Save for something
        </Link>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <Money minor={saved} className="text-xl font-semibold tracking-[-0.02em]" />
            {target > 0 && <span className="tabular text-[0.8125rem] text-muted-foreground">of {formatMoney(target, "PHP", { compact: true })}</span>}
          </div>
          {target > 0 && <ProgressBar className="mt-2" value={(saved / target) * 100} label="Overall goal progress" />}
          <ul className="mt-4 space-y-0.5">
            {data.goals.slice(0, 4).map((goal) => (
              <li key={goal.id}>
                <Link href="/goals" className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60">
                  <Donut size="size-9" stroke={9} data={[{ value: goal.pct_complete, color: "var(--primary)" }, { value: Math.max(0, 100 - goal.pct_complete), color: "transparent" }]}
                    center={<GoalIcon value={goal.emoji} className="size-3.5 text-foreground/70" />} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem]">{goal.name}</span>
                    <span className="tabular block truncate text-[0.8125rem] text-muted-foreground">{formatMoney(goal.saved_minor)} of {formatMoney(goal.target_minor)}</span>
                  </span>
                  <span className={cn("tabular text-[0.8125rem] font-medium", goal.on_track === false ? "text-warning" : "text-muted-foreground")}>{formatPct(goal.pct_complete)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}

export function NotesCard({ className }: { className?: string }) {
  const qc = useQueryClient()
  const { data: notes = [], isLoading } = useNotes()
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  async function add() {
    if (!text.trim()) return
    setBusy(true)
    try {
      await api.post("/notes", { content: text.trim() })
      setText("")
      await qc.invalidateQueries({ queryKey: ["notes"] })
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save note.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel title="Notes" href="/tools/notes" className={className}>
      <form onSubmit={(e) => { e.preventDefault(); add() }} className="flex gap-2">
        <label htmlFor="quick-note" className="sr-only">New note</label>
        <input id="quick-note" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Buy school supplies next week"
          className="h-9 min-w-0 flex-1 rounded-lg bg-muted px-3 text-base outline-none placeholder:text-muted-foreground/80 focus:ring-3 focus:ring-ring/25 sm:text-sm" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Add note"
          className="pressable flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-35">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </form>
      <ul className="mt-2 divide-y divide-border/60">
        {isLoading && <li className="py-3"><Skeleton className="h-4 w-2/3" /></li>}
        {notes.slice(0, 4).map((note) => (
          <li key={note.id} className="group flex items-start gap-2 py-2.5">
            <span className="min-w-0 flex-1 text-sm leading-relaxed">{note.content}</span>
            <button type="button" aria-label="Delete note" onClick={async () => { await api.delete(`/notes/${note.id}`); void qc.invalidateQueries({ queryKey: ["notes"] }) }}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-destructive lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {!isLoading && notes.length === 0 && <li className="py-3 text-[0.8125rem] text-muted-foreground">Jot down upcoming expenses or reminders.</li>}
      </ul>
    </Panel>
  )
}

