"use client"

import { ArrowLeftRight, Paperclip } from "lucide-react"
import { CategoryIcon } from "@/components/finance/category-icon"
import { formatDate, formatMoney } from "@/lib/format"
import type { Transaction } from "@/lib/types"
import { cn } from "@/lib/utils"

export function TransactionRow({ transaction: t, onClick, showDate }: { transaction: Transaction; onClick?: () => void; showDate?: boolean }) {
  const isTransfer = t.type === "transfer"
  const title = isTransfer ? `${t.account_name} → ${t.to_account_name}` : t.merchant ?? t.notes ?? t.category_name ?? "Transaction"
  const subtitle = isTransfer ? t.notes ?? "Transfer" : [t.subcategory_name ?? t.category_name ?? "Uncategorized", t.account_name].join(" · ")
  const amount = t.type === "income" ? formatMoney(t.amount_minor, t.currency, { signed: true }) : isTransfer
    ? formatMoney(t.amount_minor, t.currency) : formatMoney(-t.amount_minor, t.currency)
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted/70 focus-visible:bg-muted focus-visible:outline-none"
    >
      {isTransfer ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><ArrowLeftRight className="size-4" /></span>
      ) : (
        <CategoryIcon icon={t.category_icon} color={t.category_color} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{title}</span>
          {t.items.length > 0 && <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-label={`${t.items.length} items`} />}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {showDate && `${formatDate(t.occurred_on, "MMM d")} · `}{subtitle}
        </span>
      </span>
      <span className={cn("tabular shrink-0 text-sm font-medium", t.type === "income" && "text-emerald", isTransfer && "text-muted-foreground")}>
        {amount}
      </span>
    </button>
  )
}
