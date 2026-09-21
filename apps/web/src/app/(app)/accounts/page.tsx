"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowDownRight, ArrowUpRight, ArrowUpDown, ChevronDown, ChevronRight, ChevronUp, FileUp, LayoutGrid, List, Plus, Wallet } from "lucide-react"
import { toast } from "sonner"
import { BalanceLine } from "@/components/charts/charts"
import { AccountDialog } from "@/components/finance/account-dialog"
import { EmptyState } from "@/components/finance/empty-state"
import { HideAmountsButton } from "@/components/finance/hide-amounts"
import { AnimatedMoney } from "@/components/finance/money"
import { Chip, Segmented } from "@/components/ios/segmented"
import { HeaderButton, LargeTitle } from "@/components/ios/nav-header"
import { useAppActions } from "@/components/layout/app-context"
import { AccountBadge, AccountCard } from "@/components/wallet/account-card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ACCOUNT_GROUPS } from "@/lib/account-templates"
import { api } from "@/lib/api"
import { formatMoney } from "@/lib/format"
import { invalidateFinancialData, useAccounts, useBalanceHistory } from "@/lib/queries"
import type { Account, AccountType } from "@/lib/types"
import { play } from "@/lib/sound"
import { cn } from "@/lib/utils"

type View = "all" | "assets" | "liabilities"
const VIEW_KEY = "faldo:wallet-view"

function readView(): "grid" | "list" {
  if (typeof window === "undefined") return "grid"
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid"
  } catch {
    return "grid"
  }
}

const RANGES = [
  { label: "1W", days: 7, phrase: "this week" },
  { label: "1M", days: 30, phrase: "this month" },
  { label: "3M", days: 90, phrase: "in 3 months" },
  { label: "6M", days: 180, phrase: "in 6 months" },
  { label: "1Y", days: 365, phrase: "this year" },
] as const

/** Answers "how has my money moved?" for the chosen view and range. */
function BalanceTrend({ view, current }: { view: View; current: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1])
  const { data: history, isLoading } = useBalanceHistory(range.days)
  const key = view === "all" ? "net_minor" : view === "assets" ? "assets_minor" : "liabilities_minor"
  const series = (history ?? []).map((p) => ({ date: p.date, value: p[key] }))
  const first = series[0]?.value
  const change = first !== undefined ? current - first : null
  const pct = first ? (change! / Math.abs(first)) * 100 : null
  const good = change !== null && (view === "liabilities" ? change <= 0 : change >= 0)
  return (
    <div>
      {change !== null && change !== 0 && (
        <p className={cn("tabular mt-2 inline-flex items-center gap-1 text-sm font-medium", good ? "text-income" : "text-expense")}>
          {change > 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
          {formatMoney(Math.abs(change))}{pct !== null && Number.isFinite(pct) && ` (${Math.abs(pct).toFixed(1)}%)`}
          <span className="font-normal text-muted-foreground">{range.phrase}</span>
        </p>
      )}
      <div className="-mx-2 mt-3 h-[168px]">
        {isLoading ? <Skeleton className="mx-2 h-full rounded-2xl" /> : series.length > 1 ? <BalanceLine data={series} /> : (
          <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Your balance line appears after a few days of activity.</p>
        )}
      </div>
      <div className="mt-2 flex justify-center gap-1" role="radiogroup" aria-label="Chart range">
        {RANGES.map((r) => (
          <button key={r.label} type="button" role="radio" aria-checked={r.label === range.label} onClick={() => { play("select"); setRange(r) }}
            className={cn("h-8 min-w-11 rounded-full px-3 text-[0.8125rem] font-medium transition-colors",
              r.label === range.label ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AccountsPage() {
  const router = useRouter()
  const qc = useQueryClient()
  const { openAddTransaction } = useAppActions()
  const { data: accounts, isLoading } = useAccounts()
  const [dialog, setDialog] = useState<{ open: boolean; account?: Account }>({ open: false })
  const [view, setView] = useState<View>("all")
  const [layout, setLayout] = useState<"grid" | "list">(readView)
  const [filter, setFilter] = useState<AccountType | "all">("all")
  const [collapsed, setCollapsed] = useState<Set<AccountType>>(new Set())
  const [arranging, setArranging] = useState(false)
  const [order, setOrder] = useState<string[]>([])

  const active = useMemo(() => (accounts ?? []).filter((a) => !a.archived), [accounts])
  const ordered = useMemo(() => {
    if (!arranging) return active
    return order.map((id) => active.find((a) => a.id === id)).filter(Boolean) as Account[]
  }, [active, arranging, order])

  const assets = active.filter((a) => a.balance_minor > 0).reduce((s, a) => s + a.balance_minor, 0)
  const liabilities = active.filter((a) => a.balance_minor < 0).reduce((s, a) => s - a.balance_minor, 0)
  const net = assets - liabilities

  function startArranging() {
    play("select")
    setOrder(active.map((a) => a.id))
    setArranging(true)
  }

  async function finishArranging() {
    setArranging(false)
    try {
      await api.put("/accounts/order", { ids: order })
      await invalidateFinancialData(qc)
      toast.success("Account order saved")
    } catch {
      toast.error("Couldn't save the new order.")
    }
  }

  function move(id: string, direction: -1 | 1) {
    play("tap")
    setOrder((current) => {
      const next = [...current]
      const a = next.indexOf(id)
      const b = a + direction
      if (a < 0 || b < 0 || b >= next.length) return current
      ;[next[a], next[b]] = [next[b], next[a]]
      return next
    })
  }

  function changeLayout(next: "grid" | "list") {
    setLayout(next)
    try { window.localStorage.setItem(VIEW_KEY, next) } catch {}
  }

  const filters = ACCOUNT_GROUPS.filter((g) => active.some((a) => a.type === g.type))
  const inView = (a: Account) => view === "all" || (view === "assets" ? a.balance_minor >= 0 : a.balance_minor < 0)
  const shown = ordered.filter((a) => (filter === "all" || a.type === filter) && inView(a))
  const groups = ACCOUNT_GROUPS
    .filter((g) => filter === "all" || g.type === filter)
    .map((g) => ({ ...g, accounts: ordered.filter((a) => a.type === g.type && inView(a)) }))
    .filter((g) => g.accounts.length > 0)

  const headline = view === "all" ? { label: "Net worth", value: net, caption: "Everything you have, minus what you owe on cards" }
    : view === "assets" ? { label: "Assets", value: assets, caption: "Cash, e-wallets, banks and savings" }
      : { label: "Liabilities", value: liabilities, caption: "What you owe on credit cards" }

  return (
    <div className="space-y-5">
      <LargeTitle title="Wallet" subtitle="Cash, e-wallets, banks and cards you track by hand"
        actions={arranging
          ? <div className="flex gap-2">
              <HeaderButton onClick={() => setArranging(false)}>Cancel</HeaderButton>
              <Button size="sm" onClick={finishArranging}>Done</Button>
            </div>
          : <div className="flex gap-2">
              <HeaderButton onClick={() => router.push("/import")} aria-label="Import a statement"><FileUp /> <span className="max-sm:hidden">Import</span></HeaderButton>
              <HeaderButton onClick={() => setDialog({ open: true })}><Plus /> Add</HeaderButton>
            </div>} />

      {isLoading ? (
        <div className="space-y-6"><div className="space-y-3"><Skeleton className="h-8 w-60 rounded-full" /><Skeleton className="h-11 w-48" /><Skeleton className="h-40 rounded-2xl" /></div><div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[1.586] rounded-[1.125rem]" />)}</div></div>
      ) : active.length === 0 ? (
        <div className="card-surface">
          <EmptyState icon={Wallet} title="Add your first account" description="Start with where your money lives: cash, GCash, Maya or a bank account. Faldo never connects to your bank."
            action={<Button size="lg" onClick={() => setDialog({ open: true })}><Plus /> Add account</Button>} />
        </div>
      ) : (
        <>
          <section aria-label="Balance" className="lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-end lg:gap-10">
            <div>
              <Segmented label="Balance view" size="sm" value={view} onChange={setView}
                options={[{ value: "all", label: "Net worth" }, { value: "assets", label: "Assets" }, { value: "liabilities", label: "Liabilities" }]} />
              <div className="mt-5 flex items-center gap-1.5">
                <AnimatedMoney minor={headline.value} className="display-xl block lg:text-[3.25rem]" />
                <HideAmountsButton className="self-start" />
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">{headline.caption}</p>
            </div>
            <BalanceTrend view={view} current={headline.value} />
          </section>

          {arranging ? (
            <section aria-label="Reorder accounts" className="space-y-2.5">
              <p className="text-[0.8125rem] text-muted-foreground">Move accounts up or down, then tap Done. Home shows them in this order.</p>
              <ol className="ios-group divide-y divide-border/60">
                {ordered.map((account, i) => (
                  <li key={account.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
                    <AccountBadge account={account} index={active.indexOf(account)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">{account.name}</span>
                      <span className="block truncate text-[0.8125rem] text-muted-foreground">{account.institution ?? ACCOUNT_GROUPS.find((g) => g.type === account.type)?.label}</span>
                    </span>
                    <button type="button" disabled={i === 0} onClick={() => move(account.id, -1)} aria-label={`Move ${account.name} up`}
                      className="pressable flex size-10 items-center justify-center rounded-full text-foreground hover:bg-accent disabled:opacity-25"><ChevronUp className="size-5" /></button>
                    <button type="button" disabled={i === ordered.length - 1} onClick={() => move(account.id, 1)} aria-label={`Move ${account.name} down`}
                      className="pressable flex size-10 items-center justify-center rounded-full text-foreground hover:bg-accent disabled:opacity-25"><ChevronDown className="size-5" /></button>
                  </li>
                ))}
              </ol>
            </section>
          ) : (
          <>
          <div className="flex items-center gap-2">
            {filters.length > 1 ? (
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-none">
                <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
                {filters.map((f) => <Chip key={f.type} active={filter === f.type} onClick={() => setFilter(f.type)}>{f.label}</Chip>)}
              </div>
            ) : <span className="flex-1" />}
            {active.length > 1 && (
              <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={startArranging} aria-label="Reorder accounts">
                <ArrowUpDown /> <span className="max-sm:hidden">Reorder</span>
              </Button>
            )}
            <div className="flex shrink-0 rounded-full bg-muted p-1" role="radiogroup" aria-label="Layout">
              <button type="button" role="radio" aria-label="Card view" aria-checked={layout === "grid"} onClick={() => changeLayout("grid")}
                className={cn("flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors", layout === "grid" && "bg-card text-foreground shadow-[0_1px_3px_rgb(16_36_24/0.1)] dark:bg-[#2b302c]")}><LayoutGrid className="size-3.5" /></button>
              <button type="button" role="radio" aria-label="List view" aria-checked={layout === "list"} onClick={() => changeLayout("list")}
                className={cn("flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors", layout === "list" && "bg-card text-foreground shadow-[0_1px_3px_rgb(16_36_24/0.1)] dark:bg-[#2b302c]")}><List className="size-3.5" /></button>
            </div>
          </div>

          {layout === "grid" ? (
            <div className="grid grid-cols-1 gap-4 min-[560px]:grid-cols-2 lg:grid-cols-3">
              {shown.map((account) => (
                <AccountCard key={account.id} account={account} index={active.indexOf(account)} fill
                  actions={{ onEdit: (a) => setDialog({ open: true, account: a }), onAdd: (a, mode) => openAddTransaction({ mode, preset: { account_id: a.id } }) }} />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => {
                const total = group.accounts.reduce((s, a) => s + a.balance_minor, 0)
                const isCollapsed = collapsed.has(group.type)
                return (
                  <section key={group.type} className="space-y-2.5">
                    <button type="button" aria-expanded={!isCollapsed} onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(group.type)) n.delete(group.type); else n.add(group.type); return n })}
                      className="flex w-full items-center gap-1.5 rounded-md text-left">
                      <span className="section-title flex-1">{group.label}</span>
                      <span className={cn("tabular text-[0.8125rem] font-medium", total < 0 ? "text-expense" : "text-muted-foreground")}>{formatMoney(total)}</span>
                      <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", isCollapsed && "-rotate-90")} />
                    </button>
                    {!isCollapsed && (
                      <div className="ios-group divide-y divide-border/60">
                        {group.accounts.map((account) => (
                          <Link key={account.id} href={`/accounts/${account.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60">
                            <AccountBadge account={account} index={active.indexOf(account)} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[0.9375rem] font-medium">{account.name}{account.card_last4 && <span className="tabular ml-1.5 text-[0.8125rem] font-normal text-muted-foreground">•••• {account.card_last4}</span>}</span>
                              <span className="block truncate text-[0.8125rem] text-muted-foreground">{account.institution ?? group.label}, {account.transaction_count} {account.transaction_count === 1 ? "transaction" : "transactions"}</span>
                            </span>
                            <span className={cn("tabular text-[0.9375rem] font-semibold", account.balance_minor < 0 && "text-expense")}>{formatMoney(account.balance_minor, account.currency)}</span>
                            <ChevronRight className="size-4 text-muted-foreground/50" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}
          </>
          )}
        </>
      )}
      {dialog.open && <AccountDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} account={dialog.account} />}
    </div>
  )
}
