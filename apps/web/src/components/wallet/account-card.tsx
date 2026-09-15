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
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl text-[0.7rem] font-extrabold text-white", className)}
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
  const subtitle = [isCredit ? "Credit" : account.type === "savings" ? "Savings" : "Debit", account.currency, account.institution ?? ACCOUNT_TYPE_LABELS[account.type]]
    .filter(Boolean).join(" · ")

  const body = (
    <>
      <span className="pointer-events-none absolute -top-12 -right-10 size-32 rounded-full bg-white/10" aria-hidden />
      <span className="pointer-events-none absolute -bottom-16 -left-10 size-32 rounded-full bg-black/5" aria-hidden />
      <div className="relative flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur"><Icon className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate font-extrabold", large ? "text-lg" : "text-sm")}>{account.name}</p>
          <p className="truncate text-[0.68rem] text-white/75">{subtitle}</p>
        </div>
      </div>
      <div className="relative">
        {isCredit && limit > 0 && (
          <div className="mb-2">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/25"><div className="h-full rounded-full bg-white" style={{ width: `${usedPct}%` }} /></div>
            <p className="mt-1 flex justify-between text-[0.62rem] text-white/80"><span>{Math.round(usedPct)}% used</span><span>{formatMoney(limit - owed)} left</span></p>
          </div>
        )}
        <p className="text-[0.6rem] font-bold tracking-[0.12em] text-white/70 uppercase">{isCredit ? "Used credit" : "Balance"}</p>
        <p className={cn("tabular font-extrabold tracking-tight", large ? "text-3xl" : "text-lg")}>{formatMoney(isCredit ? owed : account.balance_minor, account.currency)}</p>
      </div>
    </>
  )

  return (
    <div className={cn("relative", jiggle && "animate-jiggle")} style={jiggle ? { animationDelay: `${(index % 3) * -90}ms` } : undefined}>
      {jiggle ? (
        <div {...pressHandlers} className={cn("relative flex flex-col justify-between overflow-hidden rounded-[1.4rem] p-4 text-white shadow-(--shadow-card) select-none-touch", large ? "min-h-48" : "min-h-[8.75rem]")}
          style={{ background: `linear-gradient(145deg, ${color}, color-mix(in oklab, ${color}, black 24%))` }}>{body}</div>
      ) : (
        <Link href={`/accounts/${account.id}`} {...pressHandlers}
          className={cn("pressable relative flex flex-col justify-between overflow-hidden rounded-[1.4rem] p-4 text-white shadow-(--shadow-card) select-none-touch focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", large ? "min-h-48" : "min-h-[8.75rem]")}
          style={{ background: `linear-gradient(145deg, ${color}, color-mix(in oklab, ${color}, black 24%))` }}>
          {body}
        </Link>
      )}
      {actions && !jiggle && (
        <DropdownMenu>
          <DropdownMenuTrigger aria-label={`${account.name} options`} className="absolute top-2.5 right-2.5 flex size-8 items-center justify-center rounded-full text-white/90 hover:bg-white/15">
            <MoreHorizontal className="size-4.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-2xl">
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
        <div className="absolute inset-x-0 -bottom-3 flex justify-center gap-2">
          <button type="button" disabled={!canMoveBack} onClick={() => onMove(-1)} aria-label={`Move ${account.name} earlier`}
            className="pressable flex size-8 items-center justify-center rounded-full border bg-card text-foreground shadow-(--shadow-float) disabled:opacity-30"><ChevronLeft className="size-4" /></button>
          <button type="button" disabled={!canMoveForward} onClick={() => onMove(1)} aria-label={`Move ${account.name} later`}
            className="pressable flex size-8 items-center justify-center rounded-full border bg-card text-foreground shadow-(--shadow-float) disabled:opacity-30"><ChevronRight className="size-4" /></button>
        </div>
      )}
    </div>
  )
}
