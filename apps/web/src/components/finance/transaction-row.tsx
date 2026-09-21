"use client"

import { isToday, isYesterday, parseISO } from "date-fns"
import { ArrowLeftRight, HandCoins, Paperclip, Wallet } from "lucide-react"
import { CategoryIcon } from "@/components/finance/category-icon"
import { formatDate, formatMoney } from "@/lib/format"
import type { Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

function shortDate(value: string) {
  const d = parseISO(value)
  return isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : formatDate(value, "MMM d")
}

/** One line of money: what it was, where it sits, and the amount. The list around it provides the structure. */
export function TransactionRow({ transaction: t, onClick, showDate, variant = "list" }: {
  transaction: Transaction
  onClick?: () => void
  showDate?: boolean
  /** "timeline" puts the account in a small tag under the amount, as the History timeline shows it. */
  variant?: "list" | "timeline"
}) {
  const timeline = variant === "timeline"
  const isTransfer = t.type === "transfer"
  const isOwed = t.type === "debt_in" || t.type === "debt_out"
  const inflow = t.type === "income" || t.type === "debt_in"
  const title = isTransfer ? `${t.account_name} to ${t.to_account_name}` : t.merchant ?? t.notes ?? t.category_name ?? "Transaction"
  const kind = isTransfer ? t.notes ?? "Transfer" : isOwed ? "Money owed" : t.subcategory_name ?? t.category_name ?? "Uncategorized"
  const subtitle = timeline || isTransfer ? kind : `${kind} · ${t.account_name}`
  const amount = inflow ? formatMoney(t.amount_minor, t.currency, { signed: true }) : isTransfer
    ? formatMoney(t.amount_minor, t.currency) : formatMoney(-t.amount_minor, t.currency)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none active:bg-accent"
    >
      {isTransfer || isOwed ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {isOwed ? <HandCoins className="size-[1.05rem]" /> : <ArrowLeftRight className="size-[1.05rem]" />}
        </span>
      ) : (
        <CategoryIcon icon={t.category_icon} color={t.category_color} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn("truncate text-[0.9375rem]", timeline ? "font-bold tracking-[-0.01em]" : "font-medium")}>{title}</span>
          {t.items.length > 0 && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label={`${t.items.length} items`} />}
        </span>
        <span className="mt-0.5 block truncate text-[0.8125rem] text-muted-foreground">{subtitle}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cn("tabular block text-[0.9375rem]", timeline ? "font-extrabold tracking-[-0.01em]" : "font-semibold", t.type === "income" && "text-income", (isTransfer || isOwed) && "font-medium text-muted-foreground")}>
          {amount}
        </span>
        {timeline && !isTransfer && (
          <span className="mt-1 inline-flex max-w-[7.5rem] items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground">
            <Wallet className="size-2.5 shrink-0" /><span className="truncate">{t.account_name}</span>
          </span>
        )}
        {showDate && <span className="mt-0.5 block text-xs text-muted-foreground">{shortDate(t.occurred_on)}</span>}
      </span>
    </button>
  )
}
