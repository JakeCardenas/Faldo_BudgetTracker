"use client"

import { format, isToday, isYesterday, parseISO } from "date-fns"
import { TransactionRow, TransactionRows } from "@/components/finance/transaction-row"
import { formatMoney } from "@/lib/format"
import type { Transaction } from "@/lib/types"

function dayLabel(date: string) {
  const d = parseISO(date)
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEEE")
}

export function groupByDay(items: Transaction[]) {
  const groups: { date: string; items: Transaction[]; moneyIn: number; moneyOut: number }[] = []
  for (const t of items) {
    const last = groups[groups.length - 1]
    const group = last && last.date === t.occurred_on ? last : { date: t.occurred_on, items: [], moneyIn: 0, moneyOut: 0 }
    if (group !== last) groups.push(group)
    group.items.push(t)
    if (t.type === "income") group.moneyIn += t.amount_minor
    else if (t.type === "expense") group.moneyOut += t.amount_minor
  }
  return groups
}

/**
 * Transactions by day, Threads-style: a quiet header with the day and its money in and out, then the
 * day's rows straight on the page with hairlines between them.
 */
export function DayGroups({ items, onOpen }: { items: Transaction[]; onOpen: (id: string) => void }) {
  return (
    <div className="cascade space-y-5">
      {groupByDay(items).map((group) => (
        <section key={group.date} aria-label={dayLabel(group.date)}>
          <header className="flex items-baseline justify-between gap-3 pb-1">
            <h2 className="text-[0.9375rem] font-bold tracking-[-0.01em]">
              {dayLabel(group.date)}<span className="ml-1.5 font-normal text-muted-foreground">{format(parseISO(group.date), "MMM d")}</span>
            </h2>
            <p className="tabular flex shrink-0 gap-2 text-[0.8125rem] font-semibold">
              {group.moneyIn > 0 && <span className="text-income">{formatMoney(group.moneyIn, "PHP", { signed: true })}</span>}
              {group.moneyOut > 0 && <span className="text-muted-foreground">{formatMoney(-group.moneyOut)}</span>}
            </p>
          </header>
          <TransactionRows>
            {group.items.map((t) => <TransactionRow key={t.id} transaction={t} onClick={() => onOpen(t.id)} />)}
          </TransactionRows>
        </section>
      ))}
    </div>
  )
}
