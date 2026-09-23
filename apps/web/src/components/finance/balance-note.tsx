import { CircleAlert } from "lucide-react"
import { formatMoney } from "@/lib/format"
import type { Account, AccountType } from "@/lib/types"
import { cn } from "@/lib/utils"

// Money you hold. Credit cards run below zero by design, and a custom account could be either.
const HELD: AccountType[] = ["cash", "bank", "e_wallet", "savings"]

/**
 * A heads-up when money leaving a cash, bank, e-wallet or savings account is more than it holds, which usually
 * means an income wasn't logged yet or the wrong account is picked. It never blocks saving. `returning` is money
 * already counted out of this account that the change gives back (the old amount when editing).
 */
export function BalanceNote({ account, amountMinor, returning = 0, className }: {
  account?: Account
  amountMinor: number
  returning?: number
  className?: string
}) {
  if (!account || !HELD.includes(account.type) || amountMinor <= 0) return null
  const holds = account.balance_minor + returning
  const after = holds - amountMinor
  if (after >= 0) return null
  return (
    <p role="status" className={cn("flex items-start gap-1.5 text-[0.8125rem] leading-snug text-warning", className)}>
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.2} />
      <span>
        {holds > 0 ? `That's more than ${account.name} has (${formatMoney(holds, account.currency)}).` : `${account.name} is already at ${formatMoney(holds, account.currency)}.`}
        {" "}It would go to {formatMoney(after, account.currency)}.
      </span>
    </p>
  )
}
