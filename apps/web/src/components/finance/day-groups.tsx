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
    <div className="space-y-4">
      {groupByDay(items).map((group) => (
        <section key={group.date}>
          <div className={cn("-mx-1 flex items-center justify-between rounded-xl px-3 py-1.5", stickyTop && `glass sticky z-10 ${stickyTop}`)}>
            <h3 className="eyebrow">{dayLabel(group.date)}</h3>
            <span className={cn("tabular text-xs font-extrabold", group.net > 0 ? "text-income" : group.net < 0 ? "text-expense" : "text-muted-foreground")}>
              {formatMoney(group.net, "PHP", { signed: true })}
            </span>
          </div>
          <div className="ios-group mt-1.5 divide-y divide-border/50 px-2">
            {group.items.map((t) => <TransactionRow key={t.id} transaction={t} onClick={() => onOpen(t.id)} />)}
          </div>
        </section>
      ))}
    </div>
  )
}
