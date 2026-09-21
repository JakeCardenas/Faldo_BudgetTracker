"use client"

import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { parseISO } from "date-fns"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { LogoMark } from "@/components/brand/logo"
import { AccountDialog } from "@/components/finance/account-dialog"
import { CategoryIcon } from "@/components/finance/category-icon"
import { Money } from "@/components/finance/money"
import { TransactionRow } from "@/components/finance/transaction-row"
import { Section } from "@/components/ios/panel"
import { useAppActions } from "@/components/layout/app-context"
import { AccountCard } from "@/components/wallet/account-card"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney } from "@/lib/format"
import { maskAmounts } from "@/lib/privacy"
import { invalidateFinancialData, usePulse } from "@/lib/queries"
import type { AttentionItem, Dashboard, UpcomingItem } from "@/lib/types"
import { cn } from "@/lib/utils"

export function AccountsRail({ data }: { data: Dashboard }) {
  const [adding, setAdding] = useState(false)
  const accounts = data.accounts.filter((a) => !a.archived)
  return (
    <Section title="Accounts" href="/accounts" linkLabel={accounts.length > 3 ? `All ${accounts.length}` : "See all"}>
      <div className="rail lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
        {accounts.map((account, i) => (
          <AccountCard key={account.id} account={account} index={i} size="md" fluid className={cn(i >= 3 && "lg:hidden")} />
        ))}
        <button type="button" onClick={() => setAdding(true)}
          className={cn("pressable flex h-[9.75rem] w-[9.5rem] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-foreground/15 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground",
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

/** Faldo's note on phones, where the panda is up in the balance area. */
export function FaldoNote({ data, className }: { data: Dashboard; className?: string }) {
  const { note, isLoading } = useFaldoNote(data)
  return (
    <section aria-label="Faldo's note" className={cn("flex gap-3 rounded-2xl p-4",
      note?.tone === "critical" ? "bg-danger-soft" : note?.tone === "warn" ? "bg-warning-soft" : "bg-secondary/70 dark:bg-secondary/60", className)}>
      <LogoMark className="size-10 shrink-0 drop-shadow-none" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-primary">Faldo</p>
        {isLoading && !note ? (
          <div className="space-y-2 pt-1.5"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-2/3" /></div>
        ) : note ? (
          <>
            {note.title && <p className="mt-0.5 text-[0.9375rem] font-semibold tracking-[-0.01em]">{maskAmounts(note.title)}</p>}
            <p className={cn("mt-0.5 text-[0.9375rem] leading-snug", note.title ? "text-foreground/80" : "line-clamp-4")}>{maskAmounts(note.body)}</p>
            <Link href={note.href} className="mt-2 inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-primary hover:opacity-80">
              {note.cta} <ArrowRight className="size-3.5" />
            </Link>
          </>
        ) : (
          <p className="mt-0.5 text-[0.9375rem] text-foreground/80">You&apos;re all set. Log what you spend and I&apos;ll keep an eye on the rest.</p>
        )}
      </div>
    </section>
  )
}

/** Where this month's money went, as a short ranked list rather than a chart. */
export function SpendingSummary({ data, className }: { data: Dashboard; className?: string }) {
  const rows = data.spending_by_category.slice(0, 4)
  const top = rows[0]?.amount_minor ?? 1
  const change = data.overview.expense_change_pct
  return (
    <Section title="Spending" description={`${formatDate(data.period.start, "MMMM")} so far`} href="/reports" linkLabel="Details" className={className}>
      <div className="card-surface p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <Money minor={data.overview.expense_minor} className="text-[1.625rem] leading-none font-semibold tracking-[-0.03em]" />
          {change !== null && change !== undefined && Number.isFinite(change) && change !== 0 && (
            <span className={cn("tabular inline-flex items-center gap-0.5 text-[0.8125rem] font-medium", change > 0 ? "text-warning" : "text-income")}>
              {change > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
              {change >= 100 ? "More than double last month" : `${Math.abs(Math.round(change))}% ${change > 0 ? "more" : "less"} than last month`}
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No spending logged this month yet.</p>
        ) : (
          <ul className="mt-4 space-y-3.5">
            {rows.map((r) => (
              <li key={r.label}>
                <Link href={r.category_id ? `/transactions?category=${r.category_id}` : "/transactions"} className="group flex items-center gap-3">
                  <CategoryIcon icon={r.icon} color={r.color} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[0.9375rem] group-hover:underline">{r.label}</span>
                      <Money minor={r.amount_minor} className="text-[0.9375rem] font-semibold" />
                    </span>
                    <span className="mt-1.5 block h-1.5 rounded-full" style={{ width: `${Math.max(4, (r.amount_minor / top) * 100)}%`, backgroundColor: r.color }} aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Section>
  )
}

export function DateTile({ date, tone }: { date: string; tone: "overdue" | "soon" | "normal" }) {
  const d = parseISO(date)
  return (
    <span className={cn("flex size-11 shrink-0 flex-col items-center justify-center rounded-xl leading-none",
      tone === "overdue" ? "bg-danger-soft text-expense" : tone === "soon" ? "bg-warning-soft text-warning" : "bg-muted text-foreground")}>
      <span className="text-[0.625rem] font-medium opacity-80">{formatDate(date, "MMM")}</span>
      <span className="tabular mt-0.5 text-[1.0625rem] font-semibold">{d.getDate()}</span>
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

export function ComingUp({ data, limit = 4 }: { data: Dashboard; limit?: number }) {
  const rows = comingRows(data, limit)
  return (
    <Section title="Coming up" href="/bills">
      {rows.length === 0 ? (
        <p className="card-surface px-4 py-6 text-center text-sm text-muted-foreground">Nothing due in the next three weeks.</p>
      ) : (
        <ul className="ios-group divide-y divide-border/60">
          {rows.map((row) => (
            <li key={row.key} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <DateTile date={row.date} tone={row.tone} />
                <Link href={row.href} className="min-w-0 flex-1 rounded-md">
                  <span className="block truncate text-[0.9375rem] font-medium">{row.title}</span>
                  <span className={cn("block truncate text-[0.8125rem]", row.tone === "overdue" ? "font-medium text-expense" : "text-muted-foreground")}>{row.detail}</span>
                </Link>
                <Money minor={row.amount} signed={row.income} className={cn("text-[0.9375rem] font-semibold", row.income && "text-income")} />
              </div>
              {row.attention && <div className="pl-14"><RecurringActions item={row.attention} /></div>}
            </li>
          ))}
        </ul>
      )}
    </Section>
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
        <div className="ios-group divide-y divide-border/60">
          {items.map((t) => <TransactionRow key={t.id} transaction={t} showDate onClick={() => openTransaction(t.id)} />)}
        </div>
      )}
    </Section>
  )
}
