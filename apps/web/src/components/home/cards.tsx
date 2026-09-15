"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { differenceInCalendarDays, eachDayOfInterval, format, parseISO, startOfMonth, startOfWeek, subDays } from "date-fns"
import {
  ArrowDownLeft, ArrowUpRight, CalendarClock, ChevronRight, CreditCard, Loader2, NotebookPen, Plus, TrendingDown, TrendingUp, Trash2, Wallet,
} from "lucide-react"
import { toast } from "sonner"
import { CategoryIcon } from "@/components/finance/category-icon"
import { AnimatedMoney, Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { Segmented } from "@/components/ios/segmented"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney, formatPct, todayISO } from "@/lib/format"
import { useBalanceHistory, useNotes, useTransactions, useUpcoming } from "@/lib/queries"
import type { Dashboard, UpcomingItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const RING = 2 * Math.PI * 40

export function Donut({ data, size = "size-28", center }: { data: { value: number; color: string }[]; size?: string; center: React.ReactNode }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const lengths = data.map((d) => (total > 0 ? (d.value / total) * RING : 0))
  return (
    <div className={cn("relative shrink-0", size)}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--muted)" strokeWidth="13" />
        {data.map((d, i) => (
          <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={d.color} strokeWidth="13"
            strokeDasharray={`${Math.max(0, lengths[i] - 1)} ${RING}`} strokeDashoffset={-lengths.slice(0, i).reduce((a, b) => a + b, 0)} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{center}</div>
    </div>
  )
}

export function BreakdownCard({ data }: { data: Dashboard }) {
  const rows = data.spending_by_category
  const top = rows[0]
  return (
    <Link href="/reports" className="card-surface pressable flex flex-col p-4 sm:p-5">
      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
          <Donut data={[]} center={<span className="text-lg font-extrabold">0%</span>} />
          <p className="text-xs text-muted-foreground">No spending yet this month</p>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-3">
          <Donut data={rows.map((r) => ({ value: r.amount_minor, color: r.color }))}
            center={<><span className="tabular text-xl font-extrabold">{Math.round(top.pct)}<span className="text-xs">%</span></span><span className="max-w-16 truncate text-[0.6rem] font-semibold text-muted-foreground">{top.label}</span></>} />
          <ul className="min-w-0 flex-1 space-y-1.5">
            {rows.slice(0, 4).map((row) => (
              <li key={row.label} className="flex items-center gap-1.5 text-xs">
                <CategoryIcon icon={row.icon} color={row.color} size="sm" className="size-5 [&_svg]:size-3" />
                <span className="tabular min-w-0 flex-1 truncate font-semibold">{formatPct(row.pct)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <span className="mt-3 flex items-center justify-center gap-0.5 border-t pt-2.5 text-[0.7rem] font-bold text-primary">
        View breakdown <ChevronRight className="size-3" />
      </span>
    </Link>
  )
}

type Span = "day" | "week" | "month"

export function TodayCard() {
  const [span, setSpan] = useState<Span>("day")
  const today = todayISO()
  const from = span === "day" ? today : format(span === "week" ? startOfWeek(new Date(), { weekStartsOn: 1 }) : startOfMonth(new Date()), "yyyy-MM-dd")
  const { data, isFetching } = useTransactions({ date_from: from, date_to: today, limit: 1 })
  const title = span === "day" ? "Today" : span === "week" ? "This week" : "This month"
  return (
    <section className="card-surface flex flex-col p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-tight">{title}</h2>
        {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="mt-3 flex-1 space-y-2">
        <p className="flex items-center gap-2">
          <TrendingUp className="size-4 shrink-0 text-income" strokeWidth={2.4} />
          <Money minor={data?.total_income_minor ?? 0} className="text-lg leading-none font-extrabold tracking-tight text-income" />
        </p>
        <p className="flex items-center gap-2">
          <TrendingDown className="size-4 shrink-0 text-expense" strokeWidth={2.4} />
          <Money minor={data?.total_expense_minor ?? 0} className="text-lg leading-none font-extrabold tracking-tight" />
        </p>
      </div>
      <Segmented label="Period" size="sm" className="mt-3 w-full [&>button]:px-1 [&>button]:text-[0.68rem]" value={span} onChange={setSpan}
        options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
    </section>
  )
}

export function LastSevenDaysCard() {
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
  const total = days.reduce((s, d) => s + d.amount, 0)
  return (
    <section className="card-surface flex flex-col p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="eyebrow">Last 7 days</p>
        <Money minor={total} className="text-xs font-bold text-muted-foreground" />
      </div>
      {isLoading ? <Skeleton className="mt-3 h-24 rounded-2xl" /> : (
        <div className="mt-3 flex h-24 items-end gap-1.5" role="img" aria-label={`Spending over the last 7 days, ${formatMoney(total)} total`}>
          {days.map((d) => (
            <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${format(parseISO(d.key), "EEE, MMM d")}: ${formatMoney(d.amount)}`}>
              <div className={cn("w-full max-w-4 rounded-full transition-[height] duration-700", d.isToday ? "bg-primary" : "bg-leaf/60")}
                style={{ height: `${Math.max(6, (d.amount / max) * 100)}%` }} />
              <span className={cn("text-[0.62rem] font-bold", d.isToday ? "text-foreground" : "text-muted-foreground")}>{d.label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function PaydayCard() {
  const { data: upcoming = [] } = useUpcoming(45)
  const next = upcoming.find((u) => u.is_income)
  if (!next) {
    return (
      <Link href="/bills" className="pressable flex items-center gap-3 rounded-[1.5rem] border border-dashed bg-secondary/40 p-4">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-card text-primary"><CalendarClock className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-primary">Days until payday</p>
          <p className="text-sm font-bold">Add your salary schedule</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
    )
  }
  const days = Math.max(0, differenceInCalendarDays(parseISO(next.due_on), new Date()))
  return (
    <Link href="/bills" className="pressable flex items-center gap-3 rounded-[1.5rem] bg-gradient-to-r from-secondary to-secondary/40 p-4 ring-1 ring-primary/10">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-card/80 text-primary"><TrendingUp className="size-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow text-primary">Days until payday</p>
        <p className="text-xl font-extrabold tracking-tight">{days === 0 ? "It's payday! 🎉" : `${days} day${days === 1 ? "" : "s"}`}</p>
      </div>
      <div className="text-right">
        <Money minor={next.amount_minor} className="block text-base font-extrabold text-primary" />
        <span className="text-xs text-muted-foreground">{formatDate(next.due_on, "MMM d")}</span>
      </div>
    </Link>
  )
}

function UpcomingRow({ item }: { item: UpcomingItem }) {
  const urgent = !item.is_income && (item.is_overdue || item.days_until_due <= 3)
  return (
    <li>
      <Link href="/bills" className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted/60", urgent && "bg-expense-soft hover:bg-expense-soft")}>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", item.is_income ? "bg-income-soft text-income" : urgent ? "bg-card text-expense" : "bg-muted text-muted-foreground")}>
          {item.kind === "loan" ? <CreditCard className="size-4.5" /> : item.is_income ? <Wallet className="size-4.5" /> : <CalendarClock className="size-4.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{item.name}</span>
          <span className="block text-xs text-muted-foreground">{formatDate(item.due_on, "MMM d")}</span>
        </span>
        <span className="text-right">
          {urgent && <span className="block text-[0.6rem] font-extrabold tracking-wide text-expense uppercase">
            {item.is_overdue ? "Overdue" : item.days_until_due === 0 ? "Due today" : `${item.days_until_due} day${item.days_until_due === 1 ? "" : "s"} left`}
          </span>}
          <Money minor={item.amount_minor} className={cn("block text-sm font-extrabold", item.is_income && "text-income")} />
        </span>
      </Link>
    </li>
  )
}

export function UpcomingCard({ items }: { items: UpcomingItem[] }) {
  const income = items.filter((i) => i.is_income).slice(0, 3)
  const expenses = items.filter((i) => !i.is_income).slice(0, 5)
  return (
    <section className="card-surface p-4 sm:p-5">
      <Link href="/bills" className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-secondary text-primary"><CalendarClock className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold tracking-tight">Upcoming</h2>
          <p className="text-xs text-muted-foreground">Planned and recurring money moves</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground" />
      </Link>
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing due in the next 3 weeks.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {income.length > 0 && (
            <div>
              <p className="eyebrow px-3 pb-1 text-income">Income</p>
              <ul className="space-y-1">{income.map((i) => <UpcomingRow key={`${i.recurring_payment_id}-${i.due_on}`} item={i} />)}</ul>
            </div>
          )}
          {expenses.length > 0 && (
            <div>
              <p className="eyebrow px-3 pb-1 text-expense">Expenses</p>
              <ul className="space-y-1">{expenses.map((i) => <UpcomingRow key={`${i.recurring_payment_id}-${i.due_on}`} item={i} />)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

export function BudgetsCard({ data }: { data: Dashboard }) {
  const lines = [...data.budget.lines].sort((a, b) => b.pct_used - a.pct_used).slice(0, 5)
  return (
    <section className="card-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-extrabold tracking-tight">Budgets</h2>
        <Link href="/budgets" className="text-sm font-bold text-primary hover:underline">Manage</Link>
      </div>
      {lines.length === 0 ? (
        <Link href="/budgets" className="mt-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed py-6 text-sm font-semibold text-muted-foreground hover:text-primary">
          <Plus className="size-4" /> Set your first monthly budget
        </Link>
      ) : (
        <ul className="mt-3 space-y-4">
          {lines.map((line) => (
            <li key={line.id} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <CategoryIcon icon={line.category_icon} color={line.category_color} size="sm" className="rounded-lg" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{line.category_name}</span>
                <span className="tabular text-sm font-semibold text-muted-foreground">{formatMoney(line.spent_minor)} / {formatMoney(line.limit_minor)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Monthly budget</p>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-[width] duration-700"
                  style={{ width: `${Math.min(100, line.pct_used)}%`, backgroundColor: line.status === "over" ? "var(--expense)" : line.category_color ?? "var(--primary)" }} />
              </div>
              <p className={cn("text-xs text-muted-foreground", line.status === "over" && "font-semibold text-expense")}>
                {line.remaining_minor >= 0 ? `${formatMoney(line.remaining_minor)} left this month` : `${formatMoney(-line.remaining_minor)} over budget`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function GoalsCard({ data }: { data: Dashboard }) {
  const saved = data.goals.reduce((s, g) => s + g.saved_minor, 0)
  const target = data.goals.reduce((s, g) => s + g.target_minor, 0)
  return (
    <section className="card-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Total saved across goals</p>
          <Money minor={saved} className="text-2xl font-extrabold tracking-tight" />
        </div>
        <Link href="/goals" className="text-sm font-bold text-primary hover:underline">All goals</Link>
      </div>
      {target > 0 && <ProgressBar className="mt-3 h-2.5" value={(saved / target) * 100} label="Overall goal progress" />}
      <ul className="mt-4 space-y-2">
        {data.goals.slice(0, 4).map((goal) => (
          <li key={goal.id}>
            <Link href="/goals" className="flex items-center gap-3 rounded-2xl border bg-surface p-2.5 transition-colors hover:bg-secondary/50">
              <Donut size="size-11" data={[{ value: goal.pct_complete, color: "var(--primary)" }, { value: Math.max(0, 100 - goal.pct_complete), color: "transparent" }]}
                center={<span className="text-sm" aria-hidden>{goal.emoji ?? "🎯"}</span>} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{goal.name}</span>
                <span className="block text-xs text-muted-foreground">{formatMoney(goal.saved_minor)} saved of {formatMoney(goal.target_minor)}</span>
              </span>
              <span className={cn("tabular text-sm font-extrabold", goal.on_track === false ? "text-warning" : "text-primary")}>{formatPct(goal.pct_complete)}</span>
            </Link>
          </li>
        ))}
        {data.goals.length === 0 && <li><Link href="/goals" className="flex items-center justify-center gap-2 rounded-2xl border border-dashed py-5 text-sm font-semibold text-muted-foreground hover:text-primary"><Plus className="size-4" /> Save for something</Link></li>}
      </ul>
    </section>
  )
}

export function NetWorthCard({ data }: { data: Dashboard }) {
  const { data: history } = useBalanceHistory(30)
  const first = history?.[0]?.net_minor
  const change = first !== undefined ? data.overview.total_balance_minor - first : null
  const points = history?.map((p) => p.net_minor) ?? []
  const min = Math.min(...points)
  const max = Math.max(...points)
  const path = points.map((v, i) => `${(i / Math.max(1, points.length - 1)) * 100},${max === min ? 20 : 36 - ((v - min) / (max - min)) * 32}`).join(" ")
  return (
    <Link href="/accounts" className="card-surface pressable block overflow-hidden p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="eyebrow">Net worth</p>
        {change !== null && change !== 0 && (
          <span className={cn("inline-flex items-center gap-0.5 text-xs font-bold", change > 0 ? "text-income" : "text-expense")}>
            {change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownLeft className="size-3.5" />}{formatMoney(change, "PHP", { signed: true, compact: true })} · 30d
          </span>
        )}
      </div>
      <AnimatedMoney minor={data.overview.total_balance_minor} className="mt-1 block text-3xl font-extrabold tracking-tight" />
      <p className="text-xs text-muted-foreground">Across {data.accounts.filter((a) => !a.archived).length} accounts</p>
      {points.length > 1 && (
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-3 h-12 w-full" aria-hidden>
          <polyline points={path} fill="none" stroke="var(--primary)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      )}
      <div className="mt-3 flex items-center justify-between rounded-2xl bg-secondary px-3.5 py-2.5">
        <span className="text-xs font-semibold text-secondary-foreground">Safe to spend</span>
        <span className="text-right">
          <Money minor={data.safe_to_spend.amount_minor} className={cn("block text-sm font-extrabold", data.safe_to_spend.amount_minor <= 0 ? "text-expense" : "text-secondary-foreground")} />
          <span className="text-[0.65rem] text-muted-foreground">≈{formatMoney(data.safe_to_spend.per_day_minor)}/day</span>
        </span>
      </div>
    </Link>
  )
}

export function NotesCard() {
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
    <section className="card-surface p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <NotebookPen className="size-4 text-primary" />
        <h2 className="flex-1 text-base font-extrabold tracking-tight">Quick notes</h2>
        <Link href="/tools/notes" className="text-sm font-bold text-primary hover:underline">All</Link>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); add() }} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="e.g. Buy school supplies next week"
          className="h-10 min-w-0 flex-1 rounded-xl bg-muted/70 px-3 text-base outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring/30 sm:text-sm" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Add note" className="pressable flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40">
          <Plus className="size-4" />
        </button>
      </form>
      <ul className="mt-2 divide-y divide-border/60">
        {isLoading && <li className="py-3"><Skeleton className="h-4 w-2/3" /></li>}
        {notes.slice(0, 4).map((note) => (
          <li key={note.id} className="group flex items-start gap-2 py-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-leaf" />
            <span className="min-w-0 flex-1 text-sm">{note.content}</span>
            <button type="button" aria-label="Delete note" onClick={async () => { await api.delete(`/notes/${note.id}`); void qc.invalidateQueries({ queryKey: ["notes"] }) }}
              className="rounded p-1 text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
          </li>
        ))}
        {!isLoading && notes.length === 0 && <li className="py-3 text-xs text-muted-foreground">Jot down upcoming expenses or reminders.</li>}
      </ul>
    </section>
  )
}
