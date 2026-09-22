"use client"

import { isToday, isYesterday, parseISO } from "date-fns"
import { ArrowLeftRight, HandCoins, Paperclip } from "lucide-react"
import { CategoryIcon } from "@/components/finance/category-icon"
import { formatDate, formatMoney } from "@/lib/format"
import type { Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

function shortDate(value: string) {
  const d = parseISO(value)
  return isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : formatDate(value, "MMM d")
}

/**
 * One line of money, Threads-style: the category's icon, what it was, a quiet line with the category and
 * account, and the amount (money in in green). It sits straight on the page; the list around it draws
 * the hairlines. Pressing it dips it slightly, like a button.
 */
export function TransactionRow({ transaction: t, onClick, showDate }: {
  transaction: Transaction
  onClick?: () => void
  showDate?: boolean
}) {
  const isTransfer = t.type === "transfer"
  const isOwed = t.type === "debt_in" || t.type === "debt_out"
  const inflow = t.type === "income" || t.type === "debt_in"
  const title = isTransfer ? `${t.account_name} to ${t.to_account_name}` : t.merchant ?? t.notes ?? t.category_name ?? "Transaction"
  const kind = isTransfer ? t.notes ?? "Transfer" : isOwed ? "Money owed" : t.subcategory_name ?? t.category_name ?? "Uncategorized"
  const subtitle = isTransfer ? kind : `${kind} · ${t.account_name}`
  const amount = inflow ? formatMoney(t.amount_minor, t.currency, { signed: true }) : isTransfer
    ? formatMoney(t.amount_minor, t.currency) : formatMoney(-t.amount_minor, t.currency)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-2xl px-2 py-3 text-left transition-[background-color,scale] duration-200 ease-(--ease-spring) hover:bg-accent/50 focus-visible:bg-accent focus-visible:outline-none active:scale-[0.985] active:bg-accent/70"
    >
      {isTransfer || isOwed ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70">
          {isOwed ? <HandCoins className="size-[1.1rem]" strokeWidth={1.8} /> : <ArrowLeftRight className="size-[1.1rem]" strokeWidth={1.8} />}
        </span>
      ) : (
        <CategoryIcon icon={t.category_icon} color={t.category_color} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[0.96875rem] font-semibold tracking-[-0.01em]">{title}</span>
          {t.items.length > 0 && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label={`${t.items.length} items`} />}
        </span>
        <span className="mt-0.5 block truncate text-[0.8125rem] text-muted-foreground">{subtitle}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={cn("tabular block text-[0.96875rem] font-bold tracking-[-0.01em]", inflow && "text-income", (isTransfer || isOwed) && !inflow && "font-semibold text-muted-foreground")}>
          {amount}
        </span>
        {showDate && <span className="mt-0.5 block text-xs text-muted-foreground">{shortDate(t.occurred_on)}</span>}
      </span>
    </button>
  )
}

/** A plain list of transactions with hairlines between them, straight on the page. */
export function TransactionRows({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("-mx-2 divide-y divide-border/60 [&>*]:border-border/60", className)}>{children}</div>
}
