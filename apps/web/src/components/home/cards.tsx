"use client"

import Link from "next/link"
import { CalendarClock, CreditCard, Plus, Wallet } from "lucide-react"
import { Money } from "@/components/finance/money"
import { ProgressBar } from "@/components/finance/progress-bar"
import { TransactionRow } from "@/components/finance/transaction-row"
import { Panel } from "@/components/ios/panel"
import { useAppActions } from "@/components/layout/app-context"
import { formatDate, formatMoney, formatPct } from "@/lib/format"
import { GoalIcon } from "@/lib/goal-icons"
import type { Dashboard, Transaction, UpcomingItem } from "@/lib/types"
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
            {item.is_income && "Expected · "}{dueLabel(item)}, {formatDate(item.due_on, "MMM d")}
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


export function YourMoneyCard({ data, className }: { data: Dashboard; className?: string }) {
  const spendable = data.safe_to_spend.lines.find((l) => l.key === "balance")?.amount_minor ?? 0
  const sts = data.safe_to_spend
  const owed = data.money_owed
  return (
    <Panel title="Your money" href="/accounts" linkLabel="Wallet" className={className}>
      <dl className="divide-y divide-border/60 text-[0.9375rem]">
        <div className="flex items-baseline justify-between gap-3 pb-2.5">
          <dt className="text-muted-foreground">Spendable now</dt>
          <dd><Money minor={spendable} className="font-semibold" /></dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 py-2.5">
          <dt className="text-muted-foreground">Net worth</dt>
          <dd><Money minor={data.overview.total_balance_minor} className="font-medium" /></dd>
        </div>
        {owed.owed_to_you_minor > 0 && (
          <Link href="/debts" className="flex items-baseline justify-between gap-3 py-2.5 hover:opacity-80">
            <dt className="text-muted-foreground">Owed to you</dt>
            <dd><Money minor={owed.owed_to_you_minor} className="font-medium text-income" /></dd>
          </Link>
        )}
        {owed.you_owe_minor > 0 && (
          <Link href="/debts" className="flex items-baseline justify-between gap-3 py-2.5 hover:opacity-80">
            <dt className="text-muted-foreground">You owe</dt>
            <dd><Money minor={owed.you_owe_minor} className="font-medium" /></dd>
          </Link>
        )}
        <div className="flex items-baseline justify-between gap-3 pt-2.5">
          <dt className="text-muted-foreground">Next income</dt>
          <dd className="text-right">
            {sts.next_income_on ? (
              <span className="text-[0.8125rem]">{sts.next_income_label} · {formatDate(sts.next_income_on, "MMM d")}</span>
            ) : (
              <Link href="/bills" className="text-[0.8125rem] font-medium text-primary hover:opacity-80">Add a schedule</Link>
            )}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Expected income isn&apos;t spendable until it arrives.</p>
    </Panel>
  )
}

export function RecentCard({ transactions, className }: { transactions: Transaction[]; className?: string }) {
  const { openTransaction } = useAppActions()
  return (
    <Panel title="Recent" href="/transactions" className={className} bodyClassName="px-0 sm:px-0 pt-0 pb-2">
      {transactions.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        <ul>
          {transactions.slice(0, 5).map((t) => (
            <li key={t.id}><TransactionRow transaction={t} showDate onClick={() => openTransaction(t.id)} /></li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
