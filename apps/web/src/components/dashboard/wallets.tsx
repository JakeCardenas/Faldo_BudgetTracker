"use client"

import Link from "next/link"
import { useState } from "react"
import { Banknote, CreditCard, Landmark, PiggyBank, Plus, Smartphone, Wallet, type LucideIcon } from "lucide-react"
import { ACCOUNT_TYPE_LABELS, formatMoney } from "@/lib/format"
import type { Account, AccountType } from "@/lib/types"
import { cn } from "@/lib/utils"

const TYPE_ICONS: Record<AccountType, LucideIcon> = {
  cash: Banknote, bank: Landmark, e_wallet: Smartphone, credit_card: CreditCard, savings: PiggyBank, custom: Wallet,
}

const PALETTE = ["#3f7bd1", "#df5b4f", "#4f9b47", "#6d52c9", "#e0772f", "#1f8f80", "#c2477f", "#8a6a3f"]

const FILTERS: { value: AccountType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "bank", label: "Banks" },
  { value: "e_wallet", label: "E-wallets" },
  { value: "cash", label: "Cash" },
  { value: "savings", label: "Savings" },
  { value: "credit_card", label: "Credit cards" },
]

function AccountCard({ account, index }: { account: Account; index: number }) {
  const color = account.color ?? PALETTE[index % PALETTE.length]
  const Icon = TYPE_ICONS[account.type] ?? Wallet
  const isCredit = account.type === "credit_card"
  const used = isCredit ? Math.max(0, -account.balance_minor) : 0
  const limit = account.credit_limit_minor ?? 0
  return (
    <Link href="/accounts"
      className="group relative flex min-h-[8rem] flex-col justify-between gap-3 overflow-hidden rounded-3xl p-3.5 text-white sm:p-4 shadow-(--shadow-card) transition-transform hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      style={{ background: `linear-gradient(140deg, ${color}, color-mix(in oklab, ${color}, black 22%))` }}>
      <span className="pointer-events-none absolute -top-10 -right-8 size-28 rounded-full bg-white/10" aria-hidden />
      <div className="relative flex items-start gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/20"><Icon className="size-4" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{account.name}</p>
          <p className="truncate text-[0.7rem] text-white/75">{account.institution ?? ACCOUNT_TYPE_LABELS[account.type]} · {account.currency}</p>
        </div>
      </div>
      <div className="relative">
        {isCredit && limit > 0 ? (
          <>
            <p className="text-[0.62rem] font-semibold tracking-[0.12em] text-white/70 uppercase">Used credit</p>
            <p className="tabular text-base font-extrabold tracking-tight sm:text-lg">{formatMoney(used, account.currency)}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
            </div>
          </>
        ) : (
          <>
            <p className="text-[0.62rem] font-semibold tracking-[0.12em] text-white/70 uppercase">Balance</p>
            <p className="tabular text-base font-extrabold tracking-tight sm:text-lg">{formatMoney(account.balance_minor, account.currency)}</p>
          </>
        )}
      </div>
    </Link>
  )
}

export function Wallets({ accounts }: { accounts: Account[] }) {
  const [filter, setFilter] = useState<AccountType | "all">("all")
  const active = accounts.filter((a) => !a.archived)
  const filters = FILTERS.filter((f) => f.value === "all" || active.some((a) => a.type === f.value))
  const shown = filter === "all" ? active : active.filter((a) => a.type === filter)

  return (
    <section className="card-surface flex h-full flex-col p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.95rem] font-bold tracking-tight">Wallets</h2>
        <Link href="/accounts" className="text-xs font-semibold text-primary hover:underline">Manage</Link>
      </div>
      {filters.length > 2 && (
        <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none" role="group" aria-label="Filter accounts">
          {filters.map((f) => (
            <button key={f.value} type="button" aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}
              className={cn("h-8 shrink-0 rounded-full border px-3.5 text-xs font-semibold transition-colors",
                filter === f.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 2xl:grid-cols-3">
        {shown.map((account) => <AccountCard key={account.id} account={account} index={active.indexOf(account)} />)}
        <Link href="/accounts"
          className="flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary hover:text-primary">
          <Plus className="size-5" /> Add account
        </Link>
      </div>
    </section>
  )
}
