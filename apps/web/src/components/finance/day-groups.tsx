"use client"

import { format, isToday, isYesterday, parseISO } from "date-fns"
import { TransactionRow } from "@/components/finance/transaction-row"
import { formatMoney } from "@/lib/format"
import type { Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

function dayLabel(date: string) {
  const d = parseISO(date)
  if (isToday(d)) return "Today"
  if (isYesterday(d)) return "Yesterday"
  return format(d, "EEE, MMM d")
}

export function groupByDay(items: Transaction[]) {
  const groups: { date: string; items: Transaction[]; net: number }[] = []
  for (const t of items) {
    const delta = t.type === "income" ? t.amount_minor : t.type === "expense" ? -t.amount_minor : 0
    const last = groups[groups.length - 1]
    if (last && last.date === t.occurred_on) {
      last.items.push(t)
      last.net += delta
    } else groups.push({ date: t.occurred_on, items: [t], net: delta })
  }
  return groups
}

export function DayGroups({ items, onOpen, stickyTop = false }: { items: Transaction[]; onOpen: (id: string) => void; stickyTop?: string | false }) {
  return (
    <div className="space-y-6">
      {groupByDay(items).map((group) => (
        <section key={group.date}>
          <div className={cn("flex items-baseline justify-between px-1 pb-2", stickyTop && `glass sticky z-10 ${stickyTop}`)}>
            <h3 className="text-[0.9375rem] font-semibold tracking-[-0.01em]">{dayLabel(group.date)}</h3>
            <span className={cn("tabular text-[0.8125rem] font-medium", group.net > 0 ? "text-income" : "text-muted-foreground")}>
              {formatMoney(group.net, "PHP", { signed: true })}
            </span>
          </div>
          <div className="ios-group divide-y divide-border/60">
            {group.items.map((t) => <TransactionRow key={t.id} transaction={t} onClick={() => onOpen(t.id)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
