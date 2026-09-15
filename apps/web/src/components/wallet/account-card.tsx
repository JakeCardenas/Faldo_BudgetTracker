"use client"

import Link from "next/link"
import { ArrowLeftRight, Banknote, ChevronLeft, ChevronRight, CreditCard, Eye, Landmark, MoreHorizontal, Pencil, PiggyBank, Plus, Smartphone, Wallet, type LucideIcon } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ACCOUNT_PALETTE } from "@/lib/account-templates"
import { ACCOUNT_TYPE_LABELS, formatMoney } from "@/lib/format"
import type { Account, AccountType } from "@/lib/types"
import { cn } from "@/lib/utils"

export const ACCOUNT_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote, bank: Landmark, e_wallet: Smartphone, credit_card: CreditCard, savings: PiggyBank, custom: Wallet,
}

export function accountColor(account: Account, index = 0) {
  return account.color ?? ACCOUNT_PALETTE[index % ACCOUNT_PALETTE.length]
}

export function AccountBadge({ account, className }: { account: Account; className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg text-[0.6875rem] font-semibold text-white", className)}
      style={{ backgroundColor: accountColor(account) }}>
      {account.name.slice(0, 2).toUpperCase()}
    </span>
  )
}

export interface AccountActions {
  onEdit: (account: Account) => void
  onAdd: (account: Account, mode: "expense" | "income" | "transfer") => void
}

export function AccountCard({ account, index = 0, actions, jiggle, onMove, canMoveBack, canMoveForward, pressHandlers, large }: {
  account: Account
  index?: number
  actions?: AccountActions
  jiggle?: boolean
  onMove?: (direction: -1 | 1) => void
  canMoveBack?: boolean
  canMoveForward?: boolean
  pressHandlers?: React.HTMLAttributes<HTMLElement>
  large?: boolean
}) {
  const color = accountColor(account, index)
  const Icon = ACCOUNT_ICONS[account.type] ?? Wallet
  const isCredit = account.type === "credit_card"
  const owed = isCredit ? Math.max(0, -account.balance_minor) : 0
  const limit = account.credit_limit_minor ?? 0
  const usedPct = limit > 0 ? Math.min(100, (owed / limit) * 100) : 0
  const subtitle = account.institution && account.institution !== account.name ? account.institution : ACCOUNT_TYPE_LABELS[account.type]

  const body = (
    <>
      <div className="flex items-start gap-2.5 pr-7">
        <span className={cn("flex shrink-0 items-center justify-center rounded-lg text-white", large ? "size-10" : "size-8")} style={{ backgroundColor: color }}>
          <Icon className={large ? "size-5" : "size-4"} strokeWidth={1.85} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-medium", large ? "text-base" : "text-sm")}>{account.name}</p>
          <p className="truncate text-xs text-muted-foreground">{subtitle}{account.currency !== "PHP" && `, ${account.currency}`}</p>
        </div>
      </div>
      <div>
        {isCredit && limit > 0 && (
          <div className="mb-2.5">
            <div className="h-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${usedPct}%`, backgroundColor: color }} /></div>
            <p className="tabular mt-1.5 flex justify-between text-[0.6875rem] text-muted-foreground"><span>{Math.round(usedPct)}% used</span><span>{formatMoney(limit - owed)} left</span></p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{isCredit ? "Used credit" : "Balance"}</p>
        <p className={cn("tabular font-semibold tracking-[-0.02em]", large ? "text-[2rem] leading-tight" : "text-lg leading-snug", !isCredit && account.balance_minor < 0 && "text-expense")}>
          {formatMoney(isCredit ? owed : account.balance_minor, account.currency)}
        </p>
      </div>
    </>
  )

  const surface = cn("relative flex flex-col justify-between gap-4 rounded-xl border bg-card p-4 select-none-touch", large ? "min-h-44" : "min-h-[8.5rem]")

  return (
    <div className={cn("relative", jiggle && "animate-jiggle")} style={jiggle ? { animationDelay: `${(index % 3) * -90}ms` } : undefined}>
      {jiggle ? (
        <div {...pressHandlers} className={cn(surface, "border-primary/40")}>{body}</div>
      ) : (
        <Link href={`/accounts/${account.id}`} {...pressHandlers}
          className={cn(surface, "pressable hover:border-input focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none")}>
          {body}
        </Link>
      )}
      {actions && !jiggle && (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`${account.name} options`} className="absolute top-3 right-2.5 flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent">
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild><Link href={`/accounts/${account.id}`}><Eye /> View history</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAdd(account, "expense")}><Plus /> Add expense</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAdd(account, "income")}><Plus /> Add income</DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.onAdd(account, "transfer")}><ArrowLeftRight /> Transfer from here</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => actions.onEdit(account)}><Pencil /> Edit account</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {jiggle && onMove && (
        <div className="absolute inset-x-0 -bottom-3.5 flex justify-center gap-1.5">
          <button type="button" disabled={!canMoveBack} onClick={() => onMove(-1)} aria-label={`Move ${account.name} earlier`}
            className="pressable flex size-8 items-center justify-center rounded-lg border bg-popover text-foreground shadow-(--shadow-float) disabled:opacity-30"><ChevronLeft className="size-4" /></button>
          <button type="button" disabled={!canMoveForward} onClick={() => onMove(1)} aria-label={`Move ${account.name} later`}
            className="pressable flex size-8 items-center justify-center rounded-lg border bg-popover text-foreground shadow-(--shadow-float) disabled:opacity-30"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
