"use client"

import Link from "next/link"
import { useState } from "react"
import { Banknote, CreditCard, Landmark, PiggyBank, Plus, Smartphone, Wallet } from "lucide-react"
import { AccountDialog } from "@/components/finance/account-dialog"
import { EmptyState } from "@/components/finance/empty-state"
import { AnimatedMoney, Money } from "@/components/finance/money"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ACCOUNT_TYPE_LABELS, formatMoney, timeAgo } from "@/lib/format"
import { useAccounts } from "@/lib/queries"
import type { Account } from "@/lib/types"
import { cn } from "@/lib/utils"

const ACCOUNT_ICONS = { cash: Banknote, bank: Landmark, e_wallet: Smartphone, credit_card: CreditCard, savings: PiggyBank, custom: Wallet }

function AccountCard({ account }: { account: Account }) {
  const Icon = ACCOUNT_ICONS[account.type]
  const utilization = account.type === "credit_card" && account.credit_limit_minor ? Math.min(100, (Math.abs(Math.min(0, account.balance_minor)) / account.credit_limit_minor) * 100) : null
  return (
    <Link href={`/accounts/${account.id}`} className="card-surface group flex flex-col gap-5 p-5 transition hover:-translate-y-0.5 hover:shadow-(--shadow-float)">
      <div className="flex items-start justify-between">
        <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${account.color ?? "#3e7b4d"}14`, color: account.color ?? "#3e7b4d" }}>
          <Icon className="size-5" strokeWidth={1.8} />
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{account.custom_type ?? ACCOUNT_TYPE_LABELS[account.type]}</span>
      </div>
      <div>
        <p className="font-medium">{account.name}</p>
        <p className="text-xs text-muted-foreground">{account.institution ?? "Manual account"} · {account.currency}</p>
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{account.type === "credit_card" ? "Balance owed" : "Balance"}</p>
        <Money minor={account.type === "credit_card" ? Math.abs(account.balance_minor) : account.balance_minor} className={cn("text-2xl font-semibold tracking-tight", account.balance_minor < 0 && account.type !== "credit_card" && "text-destructive")} />
        {utilization !== null && (
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-chart-5" style={{ width: `${utilization}%` }} /></div>
            <p className="text-xs text-muted-foreground">{Math.round(utilization)}% of {formatMoney(account.credit_limit_minor ?? 0)} limit</p>
          </div>
        )}
      </div>
      <p className="mt-auto text-xs text-muted-foreground">{account.transaction_count} transactions · updated {timeAgo(account.updated_at)}</p>
    </Link>
  )
}

export default function AccountsPage() {
  const [open, setOpen] = useState(false)
  const { data: accounts, isLoading } = useAccounts()
  const total = accounts?.reduce((s, a) => s + a.balance_minor, 0) ?? 0
  const spendable = accounts?.filter((a) => a.is_spendable).reduce((s, a) => s + a.balance_minor, 0) ?? 0
  const owed = accounts?.filter((a) => a.type === "credit_card").reduce((s, a) => s + Math.min(0, a.balance_minor), 0) ?? 0

  return (
    <div className="space-y-6 pt-2">
      <PageHeader title="Accounts" description="Cash, banks, e-wallets, cards and savings, tracked manually." actions={<Button onClick={() => setOpen(true)}><Plus /> Add account</Button>} />
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-2xl" />)}</div>
      ) : !accounts?.length ? (
        <div className="card-surface"><EmptyState icon={Wallet} title="Add your first account" description="Start with where your money lives: cash, GCash, Maya or a bank account." action={<Button onClick={() => setOpen(true)}><Plus /> Add account</Button>} /></div>
      ) : (
        <>
          <div className="card-surface grid gap-5 p-5 sm:grid-cols-3">
            <div><p className="text-sm text-muted-foreground">Total balance</p><AnimatedMoney minor={total} className="text-3xl font-semibold tracking-tight" /></div>
            <div><p className="text-sm text-muted-foreground">Spendable</p><Money minor={spendable} className="text-2xl font-semibold tracking-tight" /></div>
            <div><p className="text-sm text-muted-foreground">Credit card balances</p><Money minor={owed} className="text-2xl font-semibold tracking-tight" /></div>
          </div>
          <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account) => <AccountCard key={account.id} account={account} />)}
          </div>
        </>
      )}
      {open && <AccountDialog open={open} onOpenChange={setOpen} />}
    </div>
  )
}
