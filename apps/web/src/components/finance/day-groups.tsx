"use client"

import { useState } from "react"
import { format, isToday, isYesterday, parseISO } from "date-fns"
import { ChevronDown } from "lucide-react"
import { TransactionRow } from "@/components/finance/transaction-row"
import { formatMoney } from "@/lib/format"
import type { Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

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

/** Where a row sits on the timeline: red for money out, green for money in, grey for moves between accounts. */
function dotTone(t: Transaction) {
  if (t.type === "income" || t.type === "debt_in") return "bg-income"
  if (t.type === "expense" || t.type === "debt_out") return "bg-expense"
  return "bg-muted-foreground/50"
}

/**
 * Transactions as a timeline: a collapsible header per day with money in and out, then each entry with
 * the time it was logged, a dot on the timeline and its own card.
 */
export function DayGroups({ items, onOpen }: { items: Transaction[]; onOpen: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = (date: string) => setCollapsed((c) => { const n = new Set(c); if (n.has(date)) n.delete(date); else n.add(date); return n })
  return (
    <div className="space-y-6">
      {groupByDay(items).map((group) => {
        const open = !collapsed.has(group.date)
        return (
          <section key={group.date} aria-label={dayLabel(group.date)}>
            <button type="button" aria-expanded={open} onClick={() => toggle(group.date)} className="flex w-full items-start gap-1.5 rounded-md text-left">
              <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200", !open && "-rotate-90")} />
              <span className="min-w-0 flex-1">
                <span className="block text-[1rem] leading-tight font-bold tracking-[-0.015em]">{dayLabel(group.date)}</span>
                <span className="label-caps block text-[0.625rem]">{format(parseISO(group.date), "MMMM d, yyyy")}</span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                {group.moneyOut > 0 && <span className="tabular rounded-lg bg-danger-soft px-2 py-1 text-[0.75rem] font-bold text-expense">{formatMoney(-group.moneyOut)}</span>}
                {group.moneyIn > 0 && <span className="tabular rounded-lg bg-income-soft px-2 py-1 text-[0.75rem] font-bold text-income">{formatMoney(group.moneyIn, "PHP", { signed: true })}</span>}
              </span>
            </button>
            {open && (
              <ol className="relative mt-2.5 space-y-2 pl-4">
                <span aria-hidden className="absolute top-3 bottom-3 left-[3px] w-px bg-border" />
                {group.items.map((t) => (
                  <li key={t.id} className="relative">
                    <span aria-hidden className={cn("absolute top-[2.35rem] -left-4 size-[7px] rounded-full ring-[3px] ring-background", dotTone(t))} />
                    <p className="tabular mb-1 text-[0.6875rem] font-medium text-muted-foreground">{format(new Date(t.created_at), "h:mm a")}</p>
                    <div className="overflow-hidden rounded-[1rem] bg-card shadow-(--shadow-card)">
                      <TransactionRow transaction={t} variant="timeline" onClick={() => onOpen(t.id)} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )
      })}
    </div>
  )
}
