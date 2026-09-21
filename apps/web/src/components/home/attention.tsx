"use client"

import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { AlertCircle, CalendarClock, HandCoins, Loader2, PiggyBank, Wallet } from "lucide-react"
import { toast } from "sonner"
import { Panel } from "@/components/ios/panel"
import { Button } from "@/components/ui/button"
import { api, ApiError } from "@/lib/api"
import { formatDate, formatMoney } from "@/lib/format"
import { invalidateFinancialData } from "@/lib/queries"
import type { AttentionItem } from "@/lib/types"
import { cn } from "@/lib/utils"

function describe(item: AttentionItem): { title: string; detail: string; href: string; icon: typeof AlertCircle } {
  const amount = formatMoney(item.amount_minor)
  const on = item.date ? formatDate(item.date, "MMM d") : ""
  switch (item.kind) {
    case "short":
      return { title: `${amount} short before ${on}`, detail: "Bills, savings and your buffer need more than you have right now.", href: "/forecast", icon: AlertCircle }
    case "bill_overdue":
      return { title: `${item.title} was due ${on}`, detail: `${amount}. Mark it paid, or tell Faldo you already logged it.`, href: "/bills", icon: CalendarClock }
    case "income_unconfirmed":
      return { title: `Did ${item.title} arrive?`, detail: `${amount} was expected ${on}. It isn't counted until you record it.`, href: "/bills", icon: Wallet }
    case "owe_due":
      return { title: `Pay ${item.title} ${amount}`, detail: item.is_overdue ? `Was due ${on}` : `Due ${on}`, href: "/debts", icon: HandCoins }
    case "owed_overdue":
      return { title: `${item.title} owes you ${amount}`, detail: `Was due back ${on}`, href: "/debts", icon: HandCoins }
    case "budget_over":
      return { title: `${item.title} is ${amount} over budget`, detail: "This month", href: "/budgets", icon: PiggyBank }
    case "budget_at_risk":
      return { title: `${item.title} may go over budget`, detail: `${Math.round(item.pct_used ?? 0)}% used so far this month`, href: "/budgets", icon: PiggyBank }
  }
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
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {item.account_id ? (
        <Button size="sm" disabled={busy !== null} onClick={() => act("pay")}>
          {busy === "pay" && <Loader2 className="animate-spin" />} {item.kind === "income_unconfirmed" ? "Yes, record it" : "Mark paid"}
        </Button>
      ) : (
        <Button size="sm" variant="outline" asChild><Link href="/bills">Record it</Link></Button>
      )}
      <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => act("skip")}>
        {busy === "skip" && <Loader2 className="animate-spin" />} Already logged
      </Button>
    </div>
  )
}

export function AttentionCard({ items, className }: { items: AttentionItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <Panel title="Needs attention" className={className}>
      <ul className="divide-y divide-border/60">
        {items.map((item) => {
          const d = describe(item)
          const Icon = d.icon
          const recurring = item.kind === "bill_overdue" || item.kind === "income_unconfirmed"
          return (
            <li key={`${item.kind}-${item.ref_id ?? ""}-${item.date ?? ""}`} className="flex gap-3 py-3 first:pt-1 last:pb-0">
              <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                item.severity === "critical" ? "bg-danger-soft text-destructive" : item.severity === "warning" ? "bg-warning-soft text-warning" : "bg-muted text-muted-foreground")}>
                <Icon className="size-4" strokeWidth={1.85} />
              </span>
              <div className="min-w-0 flex-1">
                {recurring ? <p className="text-[0.9375rem] font-medium">{d.title}</p> : (
                  <Link href={d.href} className="text-[0.9375rem] font-medium hover:underline">{d.title}</Link>
                )}
                <p className="text-[0.8125rem] text-muted-foreground">{d.detail}</p>
                {recurring && item.ref_id && <RecurringActions item={item} />}
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
