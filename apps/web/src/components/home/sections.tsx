"use client"

import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { parseISO } from "date-fns"
import { ChevronRight, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { AccountDialog } from "@/components/finance/account-dialog"
import { Money } from "@/components/finance/money"
import { TransactionRow, TransactionRows } from "@/components/finance/transaction-row"
import { Section } from "@/components/ios/panel"
import { useAppActions } from "@/components/layout/app-context"
import { AccountCard } from "@/components/wallet/account-card"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney } from "@/lib/format"
import { invalidateFinancialData, usePulse } from "@/lib/queries"
import type { AttentionItem, Dashboard, UpcomingItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export function AccountsRail({ data }: { data: Dashboard }) {
  const [adding, setAdding] = useState(false)
  const accounts = data.accounts.filter((a) => !a.archived)
  return (
    <Section title="Accounts" href="/accounts" linkLabel={accounts.length > 3 ? `All ${accounts.length}` : "See all"}>
      <div className="rail -mb-3 overflow-y-hidden pb-4 lg:mx-0 lg:mb-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
        {accounts.map((account, i) => (
          <AccountCard key={account.id} account={account} index={i} size="md" fluid className={cn(i >= 3 && "lg:hidden")} />
        ))}
        <button type="button" onClick={() => setAdding(true)}
          className={cn("pressable flex min-h-[9rem] w-[9.5rem] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
            accounts.length >= 3 && "lg:hidden")}>
          <span className="flex size-9 items-center justify-center rounded-full bg-muted"><Plus className="size-4.5" /></span>
          Add account
        </button>
      </div>
      {adding && <AccountDialog open={adding} onOpenChange={setAdding} />}
    </Section>
  )
}

interface Note { title?: string; body: string; href: string; cta: string; tone: "calm" | "warn" | "critical" }

function noteFrom(item: AttentionItem): Note | null {
  const amount = formatMoney(item.amount_minor)
  switch (item.kind) {
    case "short":
      return { title: `${amount} short before ${item.date ? formatDate(item.date, "MMM d") : "your next income"}`, tone: "critical",
        body: "Bills, savings and your buffer need more than you have right now.", href: "/forecast", cta: "See what's coming" }
    case "budget_over":
      return { title: `${item.title} is ${amount} over budget`, tone: "warn", body: "Spending in it this month has passed the limit you set.", href: "/budgets", cta: "Review budgets" }
    case "budget_at_risk":
      return { title: `${item.title} may go over budget`, tone: "warn", body: `${Math.round(item.pct_used ?? 0)}% used so far this month.`, href: "/budgets", cta: "Review budgets" }
    default:
      return null
  }
}

/** One useful thing to know: an alert when something needs a decision, otherwise Faldo's short read of the month. */
export function useFaldoNote(data: Dashboard) {
  const { data: pulse, isLoading } = usePulse()
  const alert = data.attention.map(noteFrom).find(Boolean) ?? null
  const note: Note | null = alert ?? (pulse ? { body: pulse.text, href: "/assistant", cta: "Ask Faldo", tone: "calm" } : null)
  return { note, isLoading }
}

/** A calendar tile: the month in small caps over the day. */
export function DateTile({ date, tone }: { date: string; tone: "overdue" | "soon" | "normal" }) {
  const d = parseISO(date)
  return (
    <span className={cn("relative z-10 flex size-12 shrink-0 flex-col items-center justify-center rounded-[0.875rem] leading-none",
      tone === "overdue" ? "bg-danger-soft text-expense" : "bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)]")}>
      <span className={cn("text-[0.5625rem] font-bold tracking-[0.08em] uppercase", tone === "overdue" ? "opacity-80" : "text-muted-foreground")}>{formatDate(date, "MMM")}</span>
      <span className="tabular mt-1 text-[1.1875rem] font-extrabold tracking-[-0.02em]">{d.getDate()}</span>
    </span>
  )
}

function RecurringActions({ item }: { item: AttentionItem }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<"pay" | "skip" | null>(null)
  async function act(kind: "pay" | "skip") {
    setBusy(kind)
    try {
      await api.post(`/recurring/${item.ref_id}/${kind}`, kind === "pay" ? {} : undefined)
      await invalidateFinancialData(qc)
      toast.success(kind === "pay" ? (item.kind === "income_unconfirmed" ? "Income recorded" : "Marked as paid") : "Moved to the next date")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't update that.")
    } finally {
      setBusy(null)
    }
  }
  const pill = "pressable inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-medium disabled:opacity-50"
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {item.account_id ? (
        <button type="button" disabled={busy !== null} onClick={() => act("pay")} className={cn(pill, "bg-primary text-primary-foreground hover:bg-primary/90")}>
          {busy === "pay" && <Loader2 className="size-3.5 animate-spin" />} {item.kind === "income_unconfirmed" ? "Yes, record it" : "Mark paid"}
        </button>
      ) : (
        <Link href="/bills" className={cn(pill, "bg-primary text-primary-foreground")}>Record it</Link>
      )}
      <button type="button" disabled={busy !== null} onClick={() => act("skip")} className={cn(pill, "bg-muted text-foreground hover:bg-accent")}>
        {busy === "skip" && <Loader2 className="size-3.5 animate-spin" />} Already logged
      </button>
    </div>
  )
}

const KIND: Record<string, string> = { bill: "Bill", subscription: "Subscription", rent: "Rent", loan: "Installment", insurance: "Insurance", income: "Income", other: "Payment" }

function inDays(days: number) {
  return days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`
}

interface ComingRow { key: string; date: string; title: string; detail: string; amount: number; income: boolean; tone: "overdue" | "soon" | "normal"; href: string; attention?: AttentionItem }

function comingRows(data: Dashboard, limit: number): ComingRow[] {
  const rows: ComingRow[] = []
  for (const a of data.attention) {
    if (!a.date) continue
    const on = formatDate(a.date, "MMM d")
    if (a.kind === "bill_overdue") rows.push({ key: `a-${a.ref_id}-${a.date}`, date: a.date, title: a.title ?? "Bill", detail: `Was due ${on}`, amount: a.amount_minor, income: false, tone: "overdue", href: "/bills", attention: a })
    else if (a.kind === "income_unconfirmed") rows.push({ key: `a-${a.ref_id}-${a.date}`, date: a.date, title: a.title ?? "Income", detail: `Expected ${on}. Did it arrive?`, amount: a.amount_minor, income: true, tone: "normal", href: "/bills", attention: a })
    else if (a.kind === "owe_due") rows.push({ key: `a-${a.ref_id}`, date: a.date, title: `Pay ${a.title}`, detail: a.is_overdue ? `Money owed, was due ${on}` : `Money owed, due ${on}`, amount: a.amount_minor, income: false, tone: a.is_overdue ? "overdue" : "soon", href: "/debts" })
    else if (a.kind === "owed_overdue") rows.push({ key: `a-${a.ref_id}`, date: a.date, title: `${a.title} owes you`, detail: `Was due back ${on}`, amount: a.amount_minor, income: true, tone: "normal", href: "/debts" })
  }
  const upcoming = [...data.upcoming].filter((u) => !u.is_overdue).sort((a, b) => a.days_until_due - b.days_until_due)
  for (const u of upcoming) {
    if (rows.length >= limit) break
    rows.push(upcomingRow(u))
  }
  return rows.slice(0, Math.max(limit, rows.filter((r) => r.attention).length))
}

function upcomingRow(u: UpcomingItem): ComingRow {
  const label = u.is_income ? (u.is_one_time ? "Expected once, may not arrive" : "Expected income") : KIND[u.kind] ?? "Payment"
  return {
    key: `${u.recurring_payment_id}-${u.due_on}`, date: u.due_on, title: u.name, detail: `${label}, ${inDays(u.days_until_due)}`,
    amount: u.amount_minor, income: u.is_income, tone: !u.is_income && u.days_until_due <= 3 ? "soon" : "normal", href: "/bills",
  }
}

function statusOf(row: ComingRow, today: Date): { text: string; tone: "overdue" | "soon" | "normal" | "income" } {
  const days = Math.round((parseISO(row.date).getTime() - today.getTime()) / 86_400_000)
  if (row.income) return { text: row.attention ? "Did it arrive?" : "Expected", tone: "income" }
  if (days < 0) return { text: `${-days} ${days === -1 ? "day" : "days"} overdue`, tone: "overdue" }
  if (days === 0) return { text: "Due today", tone: "soon" }
  return { text: `${days} ${days === 1 ? "day" : "days"} left`, tone: days <= 3 ? "soon" : "normal" }
}

/** The status line's colour: red when overdue, amber when close, green for money coming in. */
const STATUS_TEXT = {
  overdue: "text-expense",
  soon: "text-warning",
  normal: "text-muted-foreground",
  income: "text-income",
}

/**
 * What's due, compact: a date tile, the name, one coloured line with how long is left (or how overdue it
 * is) and the amount, under a header with the total due. Overdue bills can be marked paid in the row.
 */
export function PaymentsDue({ data, limit = 3 }: { data: Dashboard; limit?: number }) {
  const rows = comingRows(data, limit)
  const outgoing = data.upcoming.filter((u) => !u.is_income)
  const overdue = data.attention.filter((a) => a.kind === "bill_overdue")
  const count = outgoing.length + overdue.length
  const total = outgoing.reduce((s, u) => s + u.amount_minor, 0) + overdue.reduce((s, a) => s + a.amount_minor, 0)
  const today = parseISO(formatDate(new Date().toISOString(), "yyyy-MM-dd"))
  return (
    <section aria-labelledby="payments-title" className="min-w-0">
      <Link href="/bills" className="group mb-3 flex items-center justify-between gap-3">
        <h2 id="payments-title" className="section-title">Payments due</h2>
        <span className="flex items-center gap-1 text-[0.875rem] font-medium text-primary">
          {count > 0 ? <><Money minor={total} className="font-bold" /> in 3 weeks</> : "Nothing due"}
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2.2} />
        </span>
      </Link>
      {rows.length > 0 && (
        <ul className="ios-group cascade divide-y divide-border/60">
          {rows.map((row) => {
            const status = statusOf(row, today)
            return (
              <li key={row.key} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <DateTile date={row.date} tone={status.tone === "overdue" ? "overdue" : "normal"} />
                  <Link href={row.href} className="min-w-0 flex-1 rounded-md">
                    <span className="block truncate text-[0.96875rem] font-semibold tracking-[-0.01em]">{row.title}</span>
                    <span className={cn("block truncate text-[0.8125rem] font-medium", STATUS_TEXT[status.tone])}>{status.text}</span>
                  </Link>
                  <Money minor={row.amount} signed={row.income} className={cn("text-[0.96875rem] font-bold tracking-[-0.01em]", row.income && "text-income")} />
                </div>
                {row.attention && <div className="pl-15"><RecurringActions item={row.attention} /></div>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function RecentActivity({ data }: { data: Dashboard }) {
  const { openTransaction } = useAppActions()
  const items = data.recent_transactions.slice(0, 5)
  return (
    <Section title="Recent activity" href="/transactions">
      {items.length === 0 ? (
        <p className="card-surface px-4 py-6 text-center text-sm text-muted-foreground">Nothing logged yet. Tap + to add your first.</p>
      ) : (
        <TransactionRows className="cascade">
          {items.map((t) => <TransactionRow key={t.id} transaction={t} showDate onClick={() => openTransaction(t.id)} />)}
        </TransactionRows>
      )}
    </Section>
  )
}
